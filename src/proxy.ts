import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const COOKIE = 'echoes.session.token'
const PUBLIC = ['/login', '/register', '/auth/callback', '/api', '/_next', '/favicon', '/logo', '/icons', '/manifest']

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next()

  const token = req.cookies.get(COOKIE)?.value
  if (!token && pathname.startsWith('/journal')) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('return_to', pathname + req.nextUrl.search)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/journal/:path*', '/login', '/register'],
}
