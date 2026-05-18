/**
 * Kener API Client
 * Fetches status data from a self-hosted Kener instance (https://kener.ing)
 *
 * API docs: https://kener.ing/docs/spec/v4
 * Configured via admin settings → integrations → kener (apiKey + baseUrl)
 */

import { cache } from 'react'

import { logger } from '@/packages/lib/logger'
import { getIntegrations } from '@/packages/lib/config'

// ──────────────────────────────────────────────
// Kener API types (v4)
// ──────────────────────────────────────────────

export type KenerMonitorStatus = 'UP' | 'DOWN' | 'DEGRADED' | 'UNKNOWN'

export interface KenerMonitor {
  tag: string
  name: string
  description?: string
  status: KenerMonitorStatus
  category_name?: string
  monitor_type?: string
  is_hidden?: string
  [key: string]: unknown
}

export interface KenerPageResponse {
  page: {
    page_path: string
    page_title?: string
    monitors: KenerMonitor[]
    [key: string]: unknown
  }
}

export interface KenerStatusSummary {
  page: {
    name: string
    url: string
    /** Aggregated overall status */
    status: KenerMonitorStatus
  }
  activeIncidents: KenerIncident[]
  activeMaintenances: KenerIncident[]
}

export interface KenerIncident {
  id: string
  name: string
  status?: string
  started?: string
  url?: string
}

// ──────────────────────────────────────────────
// Config helper
// ──────────────────────────────────────────────

async function getKenerConfig() {
  const integrations = await getIntegrations()
  const kener = integrations.kener as { apiKey?: string; baseUrl?: string } | undefined
  return {
    baseUrl: (kener?.baseUrl ?? process.env.KENER_BASE_URL ?? 'https://emberlystat.us').replace(/\/$/, ''),
    apiKey: kener?.apiKey ?? process.env.KENER_API_KEY ?? '',
  }
}

// Cache TTL: 60 s
const CACHE_TTL = 60

// ──────────────────────────────────────────────
// Fetch helpers
// ──────────────────────────────────────────────

async function fetchKener<T>(
  path: string,
  config: Awaited<ReturnType<typeof getKenerConfig>>,
): Promise<T | null> {
  const url = `${config.baseUrl}${path}`
  try {
    const res = await fetch(url, {
      headers: config.apiKey
        ? { Authorization: `Bearer ${config.apiKey}` }
        : {},
      next: { revalidate: CACHE_TTL, tags: ['status'] },
    })
    if (!res.ok) {
      logger.error(`Kener API error: ${res.status} ${res.statusText}`, { url })
      return null
    }
    return await res.json()
  } catch (err) {
    logger.error('Failed to fetch from Kener', {
      url,
      error: err instanceof Error ? err.message : 'Unknown error',
    })
    return null
  }
}

// ──────────────────────────────────────────────
// Aggregate status from monitor list
// ──────────────────────────────────────────────

function aggregateStatus(monitors: KenerMonitor[]): KenerMonitorStatus {
  if (monitors.length === 0) return 'UNKNOWN'
  const visible = monitors.filter(
    (m) =>
      m.is_hidden !== 'YES' &&
      m.is_hidden !== 'true' &&
      m.is_hidden !== true,
  )
  // Kener v4 returns "ACTIVE"/"INACTIVE" as workflow state, not health status
  // Map to health status: ACTIVE means UP, and we'll assume INACTIVE means DOWN
  const statuses = visible.map((m) => {
    const rawStatus = String(m.status ?? '').toUpperCase() as string
    // Map Kener workflow states to health status
    if (rawStatus === 'ACTIVE') return 'UP' as KenerMonitorStatus
    if (rawStatus === 'INACTIVE') return 'DOWN' as KenerMonitorStatus
    // Pass through actual health statuses if present
    if (['UP', 'DOWN', 'DEGRADED', 'UNKNOWN'].includes(rawStatus)) return rawStatus as KenerMonitorStatus
    return 'UNKNOWN' as KenerMonitorStatus
  })
  if (statuses.includes('DOWN')) return 'DOWN'
  if (statuses.includes('DEGRADED')) return 'DEGRADED'
  if (statuses.length > 0 && statuses.every((s) => s === 'UP')) return 'UP'
  return 'UNKNOWN'
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Returns an aggregated status summary from Kener monitor list.
 * Shape is compatible with what StatusIndicator expects.
 */
export const getKenerStatus = cache(async (): Promise<KenerStatusSummary | null> => {
  const config = await getKenerConfig()
  // /api/v4/monitors returns live per-monitor status; /api/v4/pages/ only returns config (no status field)
  const data = await fetchKener<{ monitors: KenerMonitor[] }>('/api/v4/monitors', config)
  if (!data?.monitors) return null

  const status = aggregateStatus(data.monitors)

  return {
    page: {
      name: 'Emberly Status',
      url: config.baseUrl,
      status,
    },
    activeIncidents: [],
    activeMaintenances: [],
  }
})

/**
 * Test Kener connectivity (used by admin integrations test endpoint).
 */
export async function testKenerConnection(baseUrl: string, apiKey?: string): Promise<{ ok: boolean; message: string }> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/v4/monitors`
  try {
    const res = await fetch(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { ok: false, message: `Kener API responded with ${res.status}` }
    const data = await res.json()
    const count = (data?.monitors as unknown[])?.length ?? 0
    return { ok: true, message: `Connected — ${count} monitor${count !== 1 ? 's' : ''} found` }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Connection failed' }
  }
}
