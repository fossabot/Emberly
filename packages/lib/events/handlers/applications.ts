/**
 * Application Event Handlers
 *
 * Handles application lifecycle notifications:
 * - application.submitted  → user confirmation email + admin/staff email alerts
 * - application.reviewed   → user outcome email (approved / rejected)
 */

import type { EventPayload } from '@/packages/types/events'

import { sendTemplateEmail, ApplicationStatusEmail, ApplicationReplyEmail } from '@/packages/lib/emails'
import { prisma } from '@/packages/lib/database/prisma'
import { loggers } from '@/packages/lib/logger'

import { events } from '../index'

const logger = loggers.events.getChildLogger('applications-handler')

/** Map an ApplicationType string to a title-case display name */
function formatType(type: string): string {
    const map: Record<string, string> = {
        STAFF: 'Staff',
        PARTNER: 'Partner',
        VERIFICATION: 'Verification',
        BAN_APPEAL: 'Ban Appeal',
    }
    return map[type] ?? type.charAt(0) + type.slice(1).toLowerCase()
}

export function registerApplicationHandlers(): void {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://embrly.ca'

    // ─────────────────────────────────────────────────────────────────────────
    // application.submitted — user confirmation + admin/staff alert emails
    // ─────────────────────────────────────────────────────────────────────────

    events.on(
        'application.submitted',
        'email-user-confirmation',
        async (payload: EventPayload<'application.submitted'>) => {
            const applicationType = formatType(payload.type)
            const applicationUrl = `${baseUrl}/applications`

            // 1. Send user a "we received your application" confirmation
            try {
                await sendTemplateEmail({
                    to: payload.userEmail,
                    subject: `We received your ${applicationType} application`,
                    template: ApplicationStatusEmail,
                    props: {
                        recipientName: payload.userName,
                        applicationType,
                        status: 'received',
                        applicationUrl,
                    },
                    skipTracking: true,
                })
                logger.info('Application confirmation sent to user', {
                    applicationId: payload.applicationId,
                    userId: payload.userId,
                })
            } catch (err: any) {
                logger.warn('Failed to send application confirmation to user', {
                    applicationId: payload.applicationId,
                    error: err?.message,
                })
            }

            // 2. Notify all ADMIN and SUPERADMIN users via email
            try {
                const adminUsers = await prisma.user.findMany({
                    where: {
                        role: { in: ['ADMIN', 'SUPERADMIN'] },
                        email: { not: null },
                    },
                    select: { email: true, name: true },
                })

                const adminApplicationUrl = `${baseUrl}/admin/applications/${payload.applicationId}`

                await Promise.allSettled(
                    adminUsers
                        .filter((a) => !!a.email)
                        .map((admin) =>
                            sendTemplateEmail({
                                to: admin.email!,
                                subject: `New ${applicationType} application — ${payload.userName}`,
                                template: ApplicationReplyEmail,
                                props: {
                                    recipientName: admin.name ?? undefined,
                                    replyContent: `A new ${applicationType} application has been submitted by ${payload.userName} (${payload.userEmail}).\n\nApplication ID: ${payload.applicationId}`,
                                    senderName: payload.userName,
                                    isStaffReply: false,
                                    applicationType,
                                    applicationUrl: adminApplicationUrl,
                                },
                                skipTracking: true,
                            }).catch((err) =>
                                logger.warn('Failed to send new-application email to admin', {
                                    adminEmail: admin.email,
                                    error: err?.message,
                                }),
                            ),
                        ),
                )

                logger.info('New application alerts sent to admins', {
                    applicationId: payload.applicationId,
                    adminCount: adminUsers.length,
                })
            } catch (err: any) {
                logger.warn('Failed to query admins or send new-application alerts', {
                    applicationId: payload.applicationId,
                    error: err?.message,
                })
            }
        },
        { enabled: true, timeout: 30000 },
    )

    // ─────────────────────────────────────────────────────────────────────────
    // application.reviewed — user outcome email (APPROVED / REJECTED)
    // ─────────────────────────────────────────────────────────────────────────

    events.on(
        'application.reviewed',
        'email-user-outcome',
        async (payload: EventPayload<'application.reviewed'>) => {
            const applicationType = formatType(payload.type)
            const applicationUrl = `${baseUrl}/applications`
            const status = payload.status === 'APPROVED' ? 'approved' : 'rejected'

            const subjectMap = {
                approved: `Your ${applicationType} application has been approved!`,
                rejected: `Update on your ${applicationType} application`,
            }

            try {
                await sendTemplateEmail({
                    to: payload.userEmail,
                    subject: subjectMap[status],
                    template: ApplicationStatusEmail,
                    props: {
                        recipientName: payload.userName,
                        applicationType,
                        status,
                        reviewNotes: payload.reviewNotes,
                        applicationUrl,
                    },
                    skipTracking: true,
                })
                logger.info('Application outcome email sent to user', {
                    applicationId: payload.applicationId,
                    userId: payload.userId,
                    status,
                })
            } catch (err: any) {
                logger.warn('Failed to send application outcome email', {
                    applicationId: payload.applicationId,
                    error: err?.message,
                })
            }
        },
        { enabled: true, timeout: 15000 },
    )

    logger.debug('Application event handlers registered')
}
