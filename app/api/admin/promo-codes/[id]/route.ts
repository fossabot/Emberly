import { HTTP_STATUS, apiError, apiResponse } from '@/packages/lib/api/response'
import { requireAdmin } from '@/packages/lib/auth/api-auth'
import { getStripeClient, isStripeConfigured } from '@/packages/lib/stripe/client'
import { loggers } from '@/packages/lib/logger'

const logger = loggers.api.getChildLogger('admin-promo-codes-id')

/**
 * DELETE /api/admin/promo-codes/[id]
 * Deactivates (archives) a Stripe promotion code. The underlying coupon is kept
 * so existing redemptions are not affected.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: adminUser, response } = await requireAdmin()
    if (response) return response

    if (!(await isStripeConfigured())) {
      return apiError('Stripe is not configured', HTTP_STATUS.SERVICE_UNAVAILABLE)
    }

    const { id } = await params
    const stripe = await getStripeClient()

    await stripe.promotionCodes.update(id, { active: false })

    logger.info('Promo code deactivated', { adminId: adminUser.id, promoCodeId: id })

    return apiResponse({ success: true })
  } catch (error: any) {
    if (error?.type === 'StripeInvalidRequestError') {
      return apiError(error.message, HTTP_STATUS.BAD_REQUEST)
    }
    logger.error('Error deactivating promo code', error as Error)
    return apiError('Internal server error', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}
