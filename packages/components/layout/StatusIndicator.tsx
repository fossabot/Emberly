"use client"

import React, { useEffect, useState } from 'react'

type KenerStatus = 'UP' | 'DOWN' | 'DEGRADED' | 'UNKNOWN'

type StatusPayload = {
    page: {
        name: string
        url: string
        status: KenerStatus
    }
    activeIncidents: unknown[]
    activeMaintenances: unknown[]
}

export default function StatusIndicator() {
    const [status, setStatus] = useState<StatusPayload | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let mounted = true
        async function fetchStatus() {
            try {
                const res = await fetch('/api/status')
                const j = await res.json()
                if (mounted) setStatus(j?.data ?? j)
            } catch {
                // ignore
            } finally {
                if (mounted) setLoading(false)
            }
        }
        fetchStatus()
        return () => { mounted = false }
    }, [])

    if (loading) return <div className="text-xs text-muted-foreground">Checking status…</div>
    if (!status) return null

    const s = status.page?.status

    const mapColor = (v?: string) => {
        switch (v) {
            case 'UP':       return 'bg-emerald-500'
            case 'DEGRADED': return 'bg-yellow-400'
            case 'DOWN':     return 'bg-red-500'
            default:         return 'bg-gray-400'
        }
    }

    const mapLabel = (v?: string) => {
        switch (v) {
            case 'UP':       return 'All systems operational'
            case 'DEGRADED': return 'Degraded performance'
            case 'DOWN':     return 'Service disruption'
            default:         return 'Status unknown'
        }
    }

    return (
        <div className="flex items-center gap-3">
            <a
                href="https://emberlystat.us"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${mapColor(s)}${s === 'UP' ? '' : ' animate-pulse'}`} />
                <span className="text-sm">{mapLabel(s)}</span>
            </a>
        </div>
    )
}

