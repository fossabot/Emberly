import { HTTP_STATUS, apiError, apiResponse } from '@/packages/lib/api/response'
import { requireAdmin } from '@/packages/lib/auth/api-auth'
import { prisma } from '@/packages/lib/database/prisma'
import { loggers } from '@/packages/lib/logger'
import { listObjectStorages } from '@/packages/lib/vultr'

const logger = loggers.storage

/**
 * POST /api/admin/storage/vultr/sync
 * Fetches all Object Storage instances from the Vultr account and upserts any
 * that are not already tracked in the DB.  Returns counts of imported and
 * skipped (already known) instances.
 */
export async function POST(req: Request) {
    try {
        const { response } = await requireAdmin(req)
        if (response) return response

        const vultrInstances = await listObjectStorages()

        if (vultrInstances.length === 0) {
            return apiResponse({ imported: 0, skipped: 0, total: 0, instances: [] })
        }

        // Get all already-tracked instances so we can import new ones and update stale ones
        const existing = await prisma.vultrObjectStorage.findMany({
            select: { id: true, vultrId: true, status: true, s3AccessKey: true, s3SecretKey: true },
        })
        const existingMap = new Map(existing.map((e) => [e.vultrId, e]))

        const toImport = vultrInstances.filter((v) => !existingMap.has(v.id))

        // Existing instances where status or credentials have drifted from live Vultr data
        const toUpdate = vultrInstances.filter((v) => {
            const db = existingMap.get(v.id)
            if (!db) return false
            return (
                v.status !== db.status ||
                (db.s3AccessKey === '' && v.s3_access_key) ||
                (db.s3SecretKey === '' && v.s3_secret_key)
            )
        })

        const [importedResults] = await Promise.all([
            // Import new instances
            Promise.all(
                toImport.map((v) =>
                    prisma.vultrObjectStorage.create({
                        data: {
                            vultrId: v.id,
                            label: v.label,
                            region: v.region,
                            clusterId: v.cluster_id,
                            s3Hostname: v.s3_hostname,
                            s3AccessKey: v.s3_access_key,
                            s3SecretKey: v.s3_secret_key,
                            tier: 'standard',
                            status: v.status,
                        },
                        select: {
                            id: true,
                            label: true,
                            region: true,
                            tier: true,
                            status: true,
                            s3Hostname: true,
                            createdAt: true,
                        },
                    }),
                ),
            ),
            // Update status + credentials for stale existing instances
            Promise.all(
                toUpdate.map((v) => {
                    const db = existingMap.get(v.id)!
                    return prisma.vultrObjectStorage.update({
                        where: { id: db.id },
                        data: {
                            status: v.status,
                            ...(db.s3AccessKey === '' && v.s3_access_key
                                ? { s3AccessKey: v.s3_access_key }
                                : {}),
                            ...(db.s3SecretKey === '' && v.s3_secret_key
                                ? { s3SecretKey: v.s3_secret_key }
                                : {}),
                        },
                    })
                }),
            ),
        ])

        logger.info(
            `[Admin] Vultr sync: imported ${importedResults.length}, updated ${toUpdate.length}, skipped ${existing.length - toUpdate.length}`,
        )
        return apiResponse({
            imported: importedResults.length,
            updated: toUpdate.length,
            skipped: existing.length - toUpdate.length,
            total: vultrInstances.length,
            instances: importedResults,
        })
    } catch (error) {
        logger.error('Failed to sync Vultr Object Storage instances', error as Error)
        return apiError('Internal server error', HTTP_STATUS.INTERNAL_SERVER_ERROR)
    }
}
