import type { EventPayload } from '@/packages/types/events'
import { loggers } from '@/packages/lib/logger'
import { syncStorageBucketSubscriptions } from '@/packages/lib/storage/sync-buckets'
import { events } from '../index'

const logger = loggers.events.getChildLogger('storage-sync')

/**
 * Register storage sync event handlers
 * Triggers periodic reconciliation between Stripe and database buckets
 */
export function registerStorageHandlers(): void {
  // Sync storage buckets with Stripe subscriptions
  events.on(
    'storage.sync-buckets',
    'reconcile-with-stripe',
    async (payload: EventPayload<'storage.sync-buckets'>) => {
      try {
        logger.info('Starting storage bucket sync with Stripe')

        const stats = await syncStorageBucketSubscriptions()

        logger.info('Storage bucket sync completed', {
          totalSubscriptions: stats.totalSubscriptions,
          provisioned: stats.provisioned,
          skipped: stats.skipped,
          failed: stats.failed,
          deprovisioned: stats.deprovisioned,
          duration: stats.duration,
        })
      } catch (error) {
        logger.error('Storage bucket sync failed', error as Error)
        throw error
      }
    },
    { enabled: true, timeout: 120000 } // 2 minute timeout
  )

  // Schedule periodic bucket syncs (every 1 hour)
  // This ensures that any webhooks that failed to fire are eventually corrected
  if (process.env.NODE_ENV !== 'test') {
    // Schedule the first sync to run in 30 seconds
    const now = new Date()
    const firstSync = new Date(now.getTime() + 30 * 1000)

    // Then schedule recurring syncs every hour
    events
      .schedule('storage.sync-buckets', { _trigger: 'periodic' }, firstSync)
      .then(() => {
        logger.info('Initial bucket sync scheduled', {
          scheduledFor: firstSync.toISOString(),
        })
      })
      .catch((err) => {
        logger.error('Failed to schedule initial bucket sync', err as Error)
      })
  }
}
