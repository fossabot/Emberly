import { getServerSession } from 'next-auth/next'

import { authOptions } from '@/packages/lib/auth'
import { buildPageMetadata } from '@/packages/lib/embeds/metadata'
import { prisma } from '@/packages/lib/database/prisma'
import { formatBytes } from '@/packages/lib/utils'
import { DashboardShell } from '@/packages/components/dashboard/dashboard-shell'

import { DashboardIndex } from './client'

export const metadata = buildPageMetadata({
  title: 'Dashboard',
  description: 'Your personal dashboard to manage uploads, settings, and account information.',
})

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)

  const [fileCount, urlCount, user] = await Promise.all([
    prisma.file.count({ where: { userId: session!.user.id } }),
    prisma.shortenedUrl.count({ where: { userId: session!.user.id } }),
    prisma.user.findUnique({
      where: { id: session!.user.id },
      select: { storageUsed: true },
    }),
  ])

  // storageUsed is stored in MB on the User model (same source as the quota system)
  const storageUsedBytes = (user?.storageUsed ?? 0) * 1024 * 1024

  return (
    <DashboardShell header={
      <div className="glass-card overflow-hidden gradient-border-animated">
        <div className="p-8">
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome back, <span className="text-gradient">{session!.user.name ?? 'there'}</span>
          </h1>
          <p className="text-muted-foreground mt-1">
            Here&apos;s an overview of your account.
          </p>
        </div>
      </div>
    }>
      <DashboardIndex
        userName={session!.user.name ?? 'there'}
        fileCount={fileCount}
        urlCount={urlCount}
        storageUsed={formatBytes(storageUsedBytes)}
      />
    </DashboardShell>
  )
}
