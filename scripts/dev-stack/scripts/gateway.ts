/**
 * Echoes dev-stack gateway — a tiny reverse proxy that gives the local stack
 * the same single-origin URL shape as hosted Supabase:
 *
 *   http://127.0.0.1:54321/rest/v1/*  -> PostgREST (127.0.0.1:5998)
 *   http://127.0.0.1:54321/auth/v1/*  -> GoTrue     (127.0.0.1:5999)
 *   http://127.0.0.1:54321/_stack/health -> stack status JSON
 *
 * It also performs the one header convention hosted Supabase enforces at its
 * edge: when a request carries `apikey` but no `Authorization`, the apikey is
 * promoted to a Bearer token (PostgREST derives the request's DB role from
 * the JWT's `role` claim — anon / authenticated / service_role).
 *
 * Run via:  bun scripts/dev-stack/scripts/gateway.ts
 */
import { createHmac } from 'node:crypto'

const GATEWAY_PORT = 54321
const POSTGREST = 'http://127.0.0.1:5998'
const GOTRUE = 'http://127.0.0.1:5999'

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
])

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function proxy(req: Request, upstream: string, stripPrefix: string, rewritePrefix = ''): Promise<Response> {
  const incoming = new URL(req.url)
  const target = upstream + rewritePrefix + incoming.pathname.slice(stripPrefix.length) + (incoming.search || '')

  const headers = new Headers()
  for (const [name, value] of req.headers.entries()) {
    if (HOP_BY_HOP.has(name.toLowerCase())) continue
    headers.set(name, value)
  }

  // Hosted-Supabase edge convention: apikey without Authorization becomes
  // an anonymous Bearer — PostgREST then runs the request as role `anon`.
  const apikey = headers.get('apikey')
  if (apikey && !headers.get('authorization')) {
    headers.set('authorization', `Bearer ${apikey}`)
  }

  const method = req.method
  const hasBody = method !== 'GET' && method !== 'HEAD'
  const init: RequestInit & { duplex?: 'half' } = {
    method,
    headers,
    redirect: 'manual',
  }
  if (hasBody) {
    init.body = await req.arrayBuffer()
    init.duplex = 'half'
  }

  try {
    const res = await fetch(target, init)
    const outHeaders = new Headers()
    for (const [name, value] of res.headers.entries()) {
      if (HOP_BY_HOP.has(name.toLowerCase())) continue
      outHeaders.set(name, value)
    }
    return new Response(res.body, { status: res.status, headers: outHeaders })
  } catch (cause) {
    return json(502, {
      error: 'dev-stack gateway: upstream unreachable',
      hint: `tried ${target}`,
      cause: String(cause),
    })
  }
}

async function stackHealth(): Promise<Response> {
  const [gotrue, postgrest] = await Promise.all([
    fetch(`${GOTRUE}/health`)
      .then((r) => r.status)
      .catch(() => 'down'),
    fetch(POSTGREST + '/')
      .then((r) => r.status)
      .catch(() => 'down'),
  ])
  return json(200, {
    status: gotrue !== 'down' && postgrest !== 'down' ? 'ok' : 'degraded',
    gateway: `http://127.0.0.1:${GATEWAY_PORT}`,
    gotrue,
    postgrest,
    time: new Date().toISOString(),
  })
}

Bun.serve({
  hostname: '127.0.0.1',
  port: GATEWAY_PORT,
  fetch(req) {
    const path = new URL(req.url).pathname
    if (path === '/_stack/health') return stackHealth()
    // GoTrue builds its mailer action links against API_EXTERNAL_URL with a
    // bare /verify path — GoTrue serves /verify at its own root (the /auth/v1
    // prefix is a gateway convention), so pass it straight through.
    if (path.startsWith('/verify')) {
      return proxy(req, GOTRUE, '')
    }
    if (path.startsWith('/rest/v1/') || path === '/rest/v1') {
      return proxy(req, POSTGREST, '/rest/v1')
    }
    if (path.startsWith('/auth/v1/') || path === '/auth/v1') {
      return proxy(req, GOTRUE, '/auth/v1')
    }
    return json(404, { error: 'not found (dev-stack gateway serves /rest/v1 and /auth/v1)' })
  },
})

console.log(`[gateway] listening on http://127.0.0.1:${GATEWAY_PORT} (rest -> :5998, auth -> :5999)`)
