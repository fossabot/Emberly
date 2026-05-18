export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Only initialize Sentry when a DSN is configured.
    // Without this guard, @sentry/nextjs v10 sets up OpenTelemetry providers
    // (even with `enabled: false`) which patches async_hooks and hangs requests.
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      await import('./sentry.server.config')
    }

    const { runStartupTasks } = await import('./packages/lib/startup/index')
    const { loggers } = await import('./packages/lib/logger')
    const logger = loggers.startup

    runStartupTasks()
      .then(() =>
        logger.debug('Startup tasks completed via instrumentation hook')
      )
      .catch((err) => logger.error('Startup tasks failed', err as Error))

    // Monitor memory usage in production
    if (process.env.NODE_ENV === 'production') {
      setInterval(() => {
        const memUsage = process.memoryUsage()
        if (memUsage.heapUsed > 1024 * 1024 * 1024) {
          // 1GB threshold
          logger.warn('High memory usage detected', {
            heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
            heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
            external: Math.round(memUsage.external / 1024 / 1024) + 'MB',
          })
        }
      }, 60000) // Check every minute
    }
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      await import('./sentry.edge.config')
    }
  }
}

export { captureRequestError as onRequestError } from '@sentry/nextjs'
