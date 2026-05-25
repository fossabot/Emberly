import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { getToken } from 'next-auth/jwt'

import {
  handleBotRequest,
  isBotRequest,
} from './packages/lib/middleware/bot-handler'
import {
  FILE_URL_PATTERN,
  PROTECTED_PAGE_PATHS,
  SUPERADMIN_PATHS,
  VIDEO_EXTENSIONS,
} from './packages/lib/middleware/constants'
import { Permission, hasPermission } from './packages/lib/permissions'

declare global {
  var __nextAuthLoginContext: Record<string, any>
}

if (!globalThis.__nextAuthLoginContext) {
  globalThis.__nextAuthLoginContext = {}
}

function getClientIP(request: NextRequest): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0]?.trim()
  }

  const realIP = request.headers.get('x-real-ip')
  if (realIP) {
    return realIP
  }

  const cfConnectingIP = request.headers.get('cf-connecting-ip')
  if (cfConnectingIP) {
    return cfConnectingIP
  }

  return (
    request.headers.get('x-client-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  )
}

function getGeoInfo(request: NextRequest) {
  const country =
    request.headers.get('x-vercel-ip-country') ||
    request.headers.get('cf-ipcountry') ||
    null

  const city =
    request.headers.get('x-vercel-ip-city') ||
    request.headers.get('cf-ipcity') ||
    null

  return { country, city }
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const normalizedPathname =
    pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://embrly.ca'

  const incomingHost = request.headers.get('host')?.replace(/:\d+$/, '')
  const mainHost = new URL(baseUrl).hostname

  if (
    incomingHost &&
    incomingHost !== mainHost &&
    incomingHost !== 'localhost'
  ) {
    if (pathname === '/') {
      try {
        const lookupUrl = new URL('/api/internal/domain-lookup', request.url)
        lookupUrl.searchParams.set('hostname', incomingHost)

        const res = await fetch(lookupUrl.toString())

        if (res.ok) {
          const data = await res.json()
          if (data.found && data.profileSlug) {
            return NextResponse.rewrite(
              new URL(`/user/${data.profileSlug}`, request.url)
            )
          }
        }
      } catch (e) {
        console.error('[Proxy] Custom domain lookup failed:', e)
      }
    }
  }

  if (
    pathname === '/api/auth/callback/credentials' &&
    request.method === 'POST'
  ) {
    const ip = getClientIP(request)
    const { country, city } = getGeoInfo(request)
    const userAgent = request.headers.get('user-agent')

    const contextKey = `login_context:${Date.now()}`
    globalThis.__nextAuthLoginContext[contextKey] = {
      ip: ip || undefined,
      userAgent: userAgent || undefined,
      geo: country || city ? { country, city } : null,
    }

    const now = Date.now()
    for (const key in globalThis.__nextAuthLoginContext) {
      try {
        const ts = parseInt(key.split(':')[1])
        if (now - ts > 60000) {
          delete globalThis.__nextAuthLoginContext[key]
        }
      } catch {}
    }
  }

  let tokenPromise: Promise<null | Record<string, any>> | null = null
  const getAuthToken = () => {
    if (!tokenPromise) {
      tokenPromise = getToken({ req: request }) as Promise<null | Record<
        string,
        any
      >>
    }
    return tokenPromise
  }

  const ALPHA_CUTOFF_DATE = new Date('2025-12-27T00:00:00.000Z')
  const isAlphaMigrationPage = pathname === '/auth/alpha-migration'
  const isAlphaMigrationApi = pathname === '/api/auth/alpha-migration'
  const isNextAuthRoute = pathname.startsWith('/api/auth/')
  const isApiRoute = pathname.startsWith('/api/')

  if (
    FILE_URL_PATTERN.test(pathname) &&
    pathname === normalizedPathname &&
    !normalizedPathname.endsWith('/raw') &&
    !normalizedPathname.endsWith('/direct')
  ) {
    const fileExt = normalizedPathname.split('.').pop()?.toLowerCase()
    const rangeHeader = request.headers.get('range')
    const acceptHeader = request.headers.get('accept') || ''
    const isMediaRequest =
      rangeHeader != null ||
      (acceptHeader !== '' && !acceptHeader.includes('text/html'))
    const userAgent = request.headers.get('user-agent') || ''
    const url = new URL(request.url)

    if (fileExt && VIDEO_EXTENSIONS.includes(fileExt) && isMediaRequest) {
      url.pathname = `${pathname}/raw`
      return NextResponse.rewrite(url)
    }

    // Bot HTML requests fall through so the bot handler can respect the
    // uploader's rich-embed setting.
    if (!isBotRequest(userAgent)) {
      url.pathname = `${pathname}/`
      return NextResponse.rewrite(url)
    }
  }

  const token = await getAuthToken()
  if (token) {
    const createdAt = token.createdAt ? new Date(token.createdAt) : null
    const isPreCutoffUser = createdAt && createdAt < ALPHA_CUTOFF_DATE
    const hasVerifiedEmail = token.emailVerified === true
    const needsMigration = isPreCutoffUser && !hasVerifiedEmail

    if (
      needsMigration &&
      !isAlphaMigrationPage &&
      !isAlphaMigrationApi &&
      !isNextAuthRoute &&
      !isApiRoute
    ) {
      return NextResponse.redirect(new URL('/auth/alpha-migration', baseUrl))
    }
  }

  const isVerifyEmailPage = pathname === '/auth/verify-email'
  const isVerifyEmailApi = pathname === '/api/auth/verify-email'
  const isAuthPage = pathname.startsWith('/auth/')

  if (token) {
    const isEmailVerified = token.emailVerified ? true : false

    if (
      !isEmailVerified &&
      !isVerifyEmailPage &&
      !isVerifyEmailApi &&
      !isAuthPage &&
      !isNextAuthRoute &&
      !isApiRoute
    ) {
      console.log(
        `[Proxy] Unverified user ${token.email} blocked from ${pathname}`
      )
      return NextResponse.redirect(new URL('/auth/verify-email', baseUrl))
    }
  }

  const isProfileSecurityTab =
    pathname === '/me' && request.nextUrl.searchParams.get('tab') === 'security'
  const isProfilePath = pathname === '/me'
  const isDashboardRoot = pathname === '/dashboard'

  if (token && token.passwordBreachDetectedAt) {
    if (isProfileSecurityTab) {
      return NextResponse.next()
    }
    if (isDashboardRoot) {
      console.log(
        `[Proxy] User ${token.email} with password breach detected, redirecting from dashboard to profile security`
      )
      return NextResponse.redirect(new URL('/me?tab=security', baseUrl))
    }
    if (isProfilePath && !request.nextUrl.searchParams.get('tab')) {
      console.log(
        `[Proxy] User ${token.email} with password breach detected, redirecting to security tab`
      )
      return NextResponse.redirect(new URL('/me?tab=security', baseUrl))
    }
  }

  if (
    normalizedPathname.endsWith('/raw') ||
    normalizedPathname.endsWith('/direct') ||
    pathname.startsWith('/u/')
  ) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/auth/') || pathname.startsWith('/setup')) {
    return NextResponse.next()
  }

  const ensureAuthenticated = async () => {
    const t = await getAuthToken()
    if (!t) {
      return NextResponse.redirect(new URL('/auth/login', baseUrl))
    }
    return { token: t }
  }

  if (pathname.startsWith('/admin/') || pathname === '/admin') {
    const auth = await ensureAuthenticated()
    if (auth instanceof NextResponse) return auth
    const role = auth.token?.role

    const isSuperAdminRoute = SUPERADMIN_PATHS.some((path) =>
      pathname.startsWith(path)
    )
    if (isSuperAdminRoute) {
      if (!hasPermission(role as any, Permission.PERFORM_SUPERADMIN_ACTIONS)) {
        return NextResponse.redirect(new URL('/dashboard', baseUrl))
      }
    } else if (!hasPermission(role as any, Permission.ACCESS_ADMIN_PANEL)) {
      return NextResponse.redirect(new URL('/dashboard', baseUrl))
    }
  }

  if (PROTECTED_PAGE_PATHS.some((p) => pathname.startsWith(p))) {
    const t = await getAuthToken()
    if (!t) {
      return NextResponse.redirect(new URL('/auth/login', baseUrl))
    }
  }

  // ── Video/Audio Media Requests ─────────────────────────────────────────
  // Must run BEFORE the bot handler. Discord's media proxy uses a UA that
  // contains "discord", so the bot handler would catch it and serve HTML.
  // By checking for Range headers or non-HTML Accept first, media playback
  // requests get raw file bytes while crawlers (who send Accept: text/html)
  // still fall through to the bot handler for OG metadata.
  if (
    FILE_URL_PATTERN.test(normalizedPathname) &&
    !normalizedPathname.endsWith('/raw') &&
    !normalizedPathname.endsWith('/direct')
  ) {
    const fileExt = normalizedPathname.split('.').pop()?.toLowerCase()
    if (fileExt && VIDEO_EXTENSIONS.includes(fileExt)) {
      const rangeHeader = request.headers.get('range')
      const acceptHeader = request.headers.get('accept') || ''
      const isMediaRequest =
        rangeHeader != null ||
        (acceptHeader !== '' && !acceptHeader.includes('text/html'))

      if (isMediaRequest) {
        const url = new URL(request.url)
        url.pathname = `${normalizedPathname}/raw`
        return NextResponse.rewrite(url)
      }
    }
  }

  const botResponse = await handleBotRequest(request)
  if (botResponse) return botResponse

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|icon.svg|.*\\.css|.*\\.js|.*\\.woff|.*\\.woff2|.*\\.ttf|.*\\.otf).*)',
  ],
}
