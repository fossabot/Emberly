import { z } from 'zod'

import { HTTP_STATUS, apiError, apiResponse } from '@/packages/lib/api/response'
import { requireAdmin } from '@/packages/lib/auth/api-auth'
import { prisma } from '@/packages/lib/database/prisma'
import { sendTemplateEmail, ApplicationStatusEmail } from '@/packages/lib/emails'
import { events } from '@/packages/lib/events'
import { addGrant, getDefaultGrantForApplicationType } from '@/packages/lib/grants'
import { loggers } from '@/packages/lib/logger'
import { ApplicationStatus, ApplicationType } from '@/prisma/generated/prisma/client'

const logger = loggers.api.getChildLogger('admin-applications-review')

const ReviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'REVIEWING'], {
    errorMap: () => ({ message: 'Status must be APPROVED, REJECTED, or REVIEWING' }),
  }),
  reviewNotes: z
    .string()
    .max(5000, 'Review notes must be at most 5000 characters')
    .optional(),
  /** Optional grant to award when approving a STAFF application */
  grantToAward: z.string().optional(),
})

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: adminUser, response } = await requireAdmin()
    if (response) return response

    const { id } = await params

    const existing = await prisma.application.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    })

    if (!existing) {
      return apiError('Application not found', HTTP_STATUS.NOT_FOUND)
    }

    const json = await req.json().catch(() => null)
    const parsed = ReviewSchema.safeParse(json)
    if (!parsed.success) {
      return apiError(parsed.error.issues[0].message, HTTP_STATUS.BAD_REQUEST)
    }

    const { status, reviewNotes, grantToAward } = parsed.data
    const isFinalDecision = status === 'APPROVED' || status === 'REJECTED'

    // APPROVED + BAN_APPEAL → automatically unban the user
    if (status === 'APPROVED' && existing.type === ApplicationType.BAN_APPEAL) {
      await prisma.user.update({
        where: { id: existing.userId },
        data: {
          bannedAt: null,
          banReason: null,
          banType: null,
          banExpiresAt: null,
        },
      })
      logger.info('User unbanned via approved ban appeal', {
        userId: existing.userId,
        applicationId: id,
      })
    }

    // APPROVED → auto-award grant based on application type, or manual override
    if (status === 'APPROVED') {
      const autoGrant = getDefaultGrantForApplicationType(existing.type)
      const grantValue = grantToAward ?? autoGrant
      if (grantValue) {
        await addGrant(existing.userId, grantValue as any)
        logger.info('Grant awarded on application approval', {
          userId: existing.userId,
          applicationId: id,
          grant: grantValue,
        })
      }
    }

    const updated = await prisma.application.update({
      where: { id },
      data: {
        status: status as ApplicationStatus,
        reviewedById: adminUser.id,
        reviewedAt: isFinalDecision ? new Date() : undefined,
        ...(reviewNotes !== undefined && { reviewNotes }),
      },
      include: {
        user: { select: { id: true, name: true, email: true, urlId: true } },
      },
    })

    // Emit reviewed event only on final decisions where user has an email
    if (isFinalDecision && existing.user.email) {
      void events.emit('application.reviewed', {
        applicationId: id,
        userId: existing.userId,
        userName: existing.user.name ?? 'Unknown',
        userEmail: existing.user.email,
        type: existing.type,
        status: status as 'APPROVED' | 'REJECTED',
        reviewerName: adminUser.name ?? 'Admin',
        reviewNotes: reviewNotes,
      })
    }

    // Send "under review" email directly for REVIEWING status changes
    if (status === 'REVIEWING' && existing.user.email) {
      const applicationType =
        existing.type.charAt(0) + existing.type.slice(1).toLowerCase().replace('_', ' ')
      const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://embrly.ca'
      sendTemplateEmail({
        to: existing.user.email,
        subject: `Your ${applicationType} application is under review`,
        template: ApplicationStatusEmail,
        props: {
          recipientName: existing.user.name ?? undefined,
          applicationType,
          status: 'reviewing',
          applicationUrl: `${appBaseUrl}/applications`,
        },
        skipTracking: true,
      }).catch((err) =>
        logger.warn('Failed to send reviewing notification email', {
          applicationId: id,
          error: err?.message,
        }),
      )
    }

    logger.info('Application reviewed', {
      applicationId: id,
      adminId: adminUser.id,
      status,
    })

    return apiResponse(updated)
  } catch (error) {
    logger.error('Error reviewing application', error as Error)
    return apiError('Internal server error', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}
