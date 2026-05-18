import { apiResponse } from '@/packages/lib/api/response'
import { getKenerStatus } from '@/packages/lib/kener'

/**
 * GET /api/status
 * Returns aggregated status from the Kener instance at emberlystat.us
 */
export async function GET() {
    try {
        const summary = await getKenerStatus()
        if (!summary) {
            // Kener unreachable — return a graceful UNKNOWN state rather than a hard 503
            return apiResponse({
                page: { name: 'Emberly Status', url: 'https://emberlystat.us', status: 'UNKNOWN' },
                activeIncidents: [],
                activeMaintenances: [],
            })
        }
        return apiResponse(summary)
    } catch (err) {
        console.error('Error fetching status:', err)
        return apiResponse({
            page: { name: 'Emberly Status', url: 'https://emberlystat.us', status: 'UNKNOWN' },
            activeIncidents: [],
            activeMaintenances: [],
        })
    }
}
