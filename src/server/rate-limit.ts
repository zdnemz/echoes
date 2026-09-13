import type { MiddlewareHandler } from 'hono'
import { ApiError } from './errors'
import type { AppEnv } from './types'

/**
 * In-memory sliding-window rate limiter.
 *
 * Scope: per-IP limits on unauthenticated auth endpoints (login, signup,
 * magic link, OAuth start/callback, refresh). This is the brute-force /
 * email-bombing guard a single-instance deployment needs.
 *
 * Limitation (accepted): the window state lives in the process. Multi-instance
 * or edge deployments should swap this for a shared store (Redis, Upstash).
 * The limiter interface stays the same.
 */

interface RateLimitOptions {
  /** How many requests are allowed inside the window. */
  max: number
  /** Window length in milliseconds. */
  windowMs: number
  /** Bucket prefix — separates rules from each other in the store. */
  key: string
}

const buckets = new Map<string, number[]>()

// Periodic sweep so long-lived processes don't accumulate dead buckets.
const SWEEP_INTERVAL = 5 * 60_000
let lastSweep = Date.now()

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL) return
  lastSweep = now
  for (const [k, hits] of buckets) {
    if (hits.length === 0 || hits[hits.length - 1] < now - 15 * 60_000) buckets.delete(k)
  }
}

/** Client IP: x-real-ip first, else LAST hop of x-forwarded-for, else 'unknown'. */
function clientIp(c: { req: { header(name: string): string | undefined } }): string {
  // x-real-ip is set (and overwritten) by the edge, so it is the trustworthy
  // client address on Vercel. x-forwarded-for is client-controlled unless a
  // trusted proxy rewrites it, so it stays a fallback only.
  const real = c.req.header('x-real-ip')?.trim()
  if (real) return real
  const fwd = c.req.header('x-forwarded-for')
  // Proxies append the real client address to the END of the chain; the first
  // entry is attacker-controlled (anyone can send their own X-Forwarded-For
  // header), so keying on it would let clients rotate identities at will and
  // walk around the limiter. The last entry is the one our edge added.
  if (fwd) {
    const hops = fwd
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean)
    if (hops.length > 0) return hops[hops.length - 1]
  }
  return 'unknown'
}

export function rateLimit(options: RateLimitOptions): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const now = Date.now()
    sweep(now)

    const id = `${options.key}:${clientIp(c)}`
    const hits = (buckets.get(id) ?? []).filter((t) => t > now - options.windowMs)

    if (hits.length >= options.max) {
      const oldest = hits[0]
      const retryAfterSec = Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000))
      c.header('retry-after', String(retryAfterSec))
      throw new ApiError(429, 'RATE_LIMITED', `Too many requests — try again in ${retryAfterSec}s`, {
        retry_after: [`${retryAfterSec}s`],
      })
    }

    hits.push(now)
    buckets.set(id, hits)
    await next()
  }
}

/** Ready-made rules for the auth surface. */
export const authRateLimit = () => rateLimit({ key: 'auth', max: 12, windowMs: 5 * 60_000 })
/** Stricter still: endpoints that trigger email (magic link). */
export const emailRateLimit = () => rateLimit({ key: 'email', max: 4, windowMs: 10 * 60_000 })
