import type { Context, MiddlewareHandler } from 'hono'
import { createHash } from 'node:crypto'
import { ApiError } from './errors'
import type { AppEnv } from './types'
import { hasServiceRole } from './env'
import { getServiceClient } from './supabase'

/**
 * Sliding-window rate limiter with a shared hit store.
 *
 * Scope: limits on unauthenticated endpoints (login, signup, magic link,
 * OAuth start/callback, refresh, invite-link lookup) plus a per-user ceiling
 * on authenticated routes. This is the brute-force / email-bombing /
 * scraping guard the deployment needs.
 *
 * Windows live in Postgres (migration 0009) so every instance charges the
 * same buckets — the previous per-process Map enforced N x the limit on N
 * instances, exactly when under attack. When the service role is unavailable
 * the limiter degrades to the in-memory map rather than taking the API down
 * with it; same on any store error (fail-open, like before).
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

// ---------------------------------------------------------------- client identity

/**
 * How many proxies in front of us we own and therefore trust.
 *
 * Set TRUSTED_PROXY_HOPS=1 when the app runs behind your own nginx/Caddy that
 * appends to X-Forwarded-For. 0 (the default) means "no trusted proxy", so
 * forwarded headers are treated as attacker-controlled and ignored.
 */
function trustedProxyHops(): number {
  const raw = process.env.TRUSTED_PROXY_HOPS
  if (raw === undefined || raw.trim() === '') return 0
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/**
 * Pick the address our own proxy chain saw.
 *
 * Every proxy appends the address it received the request from, so the
 * entries our proxies added are at the END of the list; anything before them
 * is attacker-supplied. Taking `hops` from the end lands on the real client
 * even when the caller pre-seeded X-Forwarded-For with junk.
 */
function addressFromForwardedFor(fwd: string, hops: number): string | null {
  const list = fwd
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean)
  if (list.length === 0) return null
  return list[Math.max(0, list.length - hops)] ?? null
}

/**
 * Fallback identity when no trustworthy address is available.
 *
 * Previously every such client shared one 'unknown' bucket, so 12 failed
 * logins from anywhere locked out every user behind that deployment. A
 * coarse request fingerprint keeps unrelated clients in separate buckets.
 * It is deliberately weak — it is a better-than-one-bucket fallback, not an
 * identity.
 */
function requestFingerprint(c: Context): string {
  const material = [c.req.header('user-agent'), c.req.header('accept-language'), c.req.header('accept-encoding')]
    .map((v) => v ?? '')
    .join('|')
  return `fp:${createHash('sha256').update(material).digest('hex').slice(0, 16)}`
}

/**
 * Best available client identity.
 *
 * X-Real-IP and X-Forwarded-For are both client-controlled unless a proxy we
 * own rewrites them. Trusting X-Real-IP first — the old behaviour — meant any
 * client could send `X-Real-IP: <random>` per request and walk straight
 * through the login rate limit on a self-hosted deployment, because only
 * Vercel's edge actually overwrites that header.
 */
function clientIp(c: Context): string {
  const hops = trustedProxyHops()
  if (hops > 0) {
    const fwd = c.req.header('x-forwarded-for')
    if (fwd) {
      const ip = addressFromForwardedFor(fwd, hops)
      if (ip) return ip
    }
  }

  // Vercel's edge sets (and overwrites) X-Real-IP on every request, so a
  // client cannot forge it there.
  if (process.env.VERCEL) {
    const real = c.req.header('x-real-ip')?.trim()
    if (real) return real
  }

  return requestFingerprint(c)
}

// ---------------------------------------------------------------- store

interface WindowState {
  count: number
  /** Oldest hit in the window as epoch ms, for retry-after. */
  oldest: number | undefined
}

/**
 * One Postgres round trip: prune expired rows, record this hit, and report
 * the window. A single statement keeps concurrent requests from both
 * slipping under the limit.
 */
async function pgConsume(bucket: string, windowMs: number): Promise<WindowState> {
  const service = getServiceClient()
  if (!service) throw new Error('service-role unavailable')
  const { data, error } = await service.rpc('rate_limit_consume', { p_bucket: bucket, p_window_ms: windowMs })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as { hit_count?: number | string; oldest_at?: string } | undefined
  return {
    count: Number(row?.hit_count ?? 1),
    oldest: row?.oldest_at ? new Date(row.oldest_at).getTime() : undefined,
  }
}

/** Read-only counterpart: inspect the window without recording a hit. */
async function pgCount(bucket: string, windowMs: number): Promise<WindowState> {
  const service = getServiceClient()
  if (!service) throw new Error('service-role unavailable')
  const { data, error } = await service.rpc('rate_limit_count', { p_bucket: bucket, p_window_ms: windowMs })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as { hit_count?: number | string; oldest_at?: string } | undefined
  return {
    count: Number(row?.hit_count ?? 0),
    oldest: row?.oldest_at ? new Date(row.oldest_at).getTime() : undefined,
  }
}

// ---------------------------------------------------------------- core

/** Consume one token from `bucket`; throw 429 when the window is full. */
async function consume(bucket: string, options: RateLimitOptions, now: number): Promise<void> {
  if (hasServiceRole()) {
    try {
      const state = await pgConsume(bucket, options.windowMs)
      if (state.count > options.max) {
        const retryAfterSec = Math.max(1, Math.ceil(((state.oldest ?? now) + options.windowMs - now) / 1000))
        throw new ApiError(429, 'RATE_LIMITED', `Too many requests — try again in ${retryAfterSec}s`, {
          retry_after: [`${retryAfterSec}s`],
        })
      }
      return
    } catch (err) {
      if (err instanceof ApiError) throw err
      // Store unreachable — degrade to the per-instance map below.
    }
  }

  const hits = (buckets.get(bucket) ?? []).filter((t) => t > now - options.windowMs)

  if (hits.length >= options.max) {
    const oldest = hits[0]
    const retryAfterSec = Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000))
    throw new ApiError(429, 'RATE_LIMITED', `Too many requests — try again in ${retryAfterSec}s`, {
      retry_after: [`${retryAfterSec}s`],
    })
  }

  hits.push(now)
  buckets.set(bucket, hits)
}

/** Set the retry-after hint on a 429 response. */
async function withRetryHeader(c: Context, options: RateLimitOptions, now: number): Promise<void> {
  let oldest: number | undefined
  if (hasServiceRole()) {
    try {
      oldest = (await pgCount(`${options.key}:${clientIp(c)}`, options.windowMs)).oldest
    } catch {
      // Fall through to the memory map.
    }
  }
  oldest ??= (buckets.get(`${options.key}:${clientIp(c)}`) ?? [])[0]
  if (oldest === undefined) return
  const retryAfterSec = Math.max(1, Math.ceil((oldest + options.windowMs - now) / 1000))
  c.header('retry-after', String(retryAfterSec))
}

export function rateLimit(options: RateLimitOptions): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const now = Date.now()
    sweep(now)

    try {
      await consume(`${options.key}:${clientIp(c)}`, options, now)
    } catch (err) {
      await withRetryHeader(c, options, now)
      throw err
    }

    await next()
  }
}

// ---------------------------------------------------------------- account dimension

/**
 * Read the submitted email without consuming the request body.
 * Returns null when there isn't a usable one (the IP limit still applies).
 */
async function bodyEmail(c: Context): Promise<string | null> {
  try {
    const text = await c.req.raw.clone().text()
    if (!text) return null
    const parsed: unknown = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && 'email' in parsed) {
      const email = (parsed as { email: unknown }).email
      if (typeof email === 'string' && email.includes('@')) return email.trim().toLowerCase()
    }
  } catch {
    // Not JSON, or no email field — nothing to key on.
  }
  return null
}

/**
 * Record one hit against a bucket without enforcing anything.
 * Used after a request finishes, to count only the attempts that matter.
 */
async function record(bucket: string, now: number, windowMs: number): Promise<void> {
  if (hasServiceRole()) {
    try {
      await pgConsume(bucket, windowMs)
      return
    } catch {
      // Degrade to memory (see consume).
    }
  }
  const hits = (buckets.get(bucket) ?? []).filter((t) => t > now - windowMs)
  hits.push(now)
  buckets.set(bucket, hits)
}

/** How many hits a bucket holds inside its window. */
async function count(bucket: string, now: number, windowMs: number): Promise<number> {
  if (hasServiceRole()) {
    try {
      return (await pgCount(bucket, windowMs)).count
    } catch {
      // Degrade to memory (see consume).
    }
  }
  return (buckets.get(bucket) ?? []).filter((t) => t > now - windowMs).length
}

interface CredentialRule {
  key: string
  max: number
  windowMs: number
}

function tooMany(options: CredentialRule, remainingSec: number): ApiError {
  return new ApiError(429, 'RATE_LIMITED', `Too many requests — try again in ${remainingSec}s`, {
    retry_after: [`${remainingSec}s`],
  })
}

/**
 * Credential endpoints (login, signup) limited on two independent dimensions.
 *
 * IP alone is not enough in either direction: credential stuffing arrives
 * from many IPs aimed at one account, while a shared NAT puts many accounts
 * behind one IP. The per-account bucket bounds brute force even when the
 * caller can spoof or hide their address.
 *
 * Only *failed* attempts are charged. Charging every request would lock a
 * legitimate user out after five ordinary sign-ins inside the window — a
 * limiter that punishes correct use is worse than none. The IP dimension
 * still charges every request (cheap DoS protection), while the account
 * dimension is charged from the response status.
 */
export function credentialRateLimit(): MiddlewareHandler<AppEnv> {
  const ipRule: CredentialRule = { key: 'auth', max: 12, windowMs: 5 * 60_000 }
  const accountRule: CredentialRule = { key: 'auth-account', max: 5, windowMs: 15 * 60_000 }

  return async (c, next) => {
    const now = Date.now()
    sweep(now)

    const ipBucket = `${ipRule.key}:${clientIp(c)}`
    try {
      await consume(ipBucket, ipRule, now)
    } catch (err) {
      await withRetryHeader(c, ipRule, now)
      throw err
    }

    const email = await bodyEmail(c)
    // Hash: keeps plaintext identifiers out of the in-memory bucket store.
    const digest = email ? createHash('sha256').update(email).digest('hex').slice(0, 32) : null
    const accountBucket = digest ? `${accountRule.key}:${digest}` : null

    // Refuse before doing work if this account is already over budget.
    if (accountBucket) {
      const failures = await count(accountBucket, now, accountRule.windowMs)
      if (failures >= accountRule.max) {
        // Oldest hit for retry-after: consult the same store count() used.
        let oldest: number | undefined
        if (hasServiceRole()) {
          try {
            oldest = (await pgCount(accountBucket, accountRule.windowMs)).oldest
          } catch {
            // Fall through to memory.
          }
        }
        oldest ??= (buckets.get(accountBucket) ?? []).filter((t) => t > now - accountRule.windowMs)[0]
        const retryAfterSec = Math.max(1, Math.ceil(((oldest ?? now) + accountRule.windowMs - now) / 1000))
        throw tooMany(accountRule, retryAfterSec)
      }
    }

    await next()

    // Charge the account only for rejected credentials (4xx), so a correct
    // password never counts against the user.
    if (accountBucket && c.res.status >= 400) await record(accountBucket, Date.now(), accountRule.windowMs)
  }
}

// ---------------------------------------------------------------- ready-made rules

/** Auth endpoints (login, signup, magic link, OAuth, refresh). */
export const authRateLimit = credentialRateLimit
/** Stricter still: endpoints that trigger email (magic link). */
export const emailRateLimit = () => rateLimit({ key: 'email', max: 4, windowMs: 10 * 60_000 })

/**
 * Generous per-user ceiling for every authenticated route.
 *
 * Only the auth surface and one public invite lookup were limited before, so a
 * single signed-in account could drive unlimited writes and the two expensive
 * list endpoints (`?count=exact` plus a leading-wildcard `ilike`) as fast as it
 * could send them. Keyed on the user id, which — unlike an address — cannot be
 * spoofed and does not collapse a whole NAT behind one bucket.
 *
 * The ceiling is deliberately far above real use (a person does not make 240
 * requests a minute); it exists to bound abuse, not to meter ordinary work.
 */
const USER_RULE: RateLimitOptions = { key: 'user', max: 240, windowMs: 60_000 }

/** Throws 429 when this user is over the shared budget. Called by requireAuth. */
export async function assertUserBudget(c: Context, userId: string): Promise<void> {
  const now = Date.now()
  sweep(now)
  try {
    await consume(`${USER_RULE.key}:${userId}`, USER_RULE, now)
  } catch (err) {
    const hits = buckets.get(`${USER_RULE.key}:${userId}`) ?? []
    const oldest = hits[0]
    if (oldest !== undefined) {
      const retryAfterSec = Math.max(1, Math.ceil((oldest + USER_RULE.windowMs - now) / 1000))
      c.header('retry-after', String(retryAfterSec))
    }
    throw err
  }
}

/**
 * Unauthenticated invite-link lookup.
 *
 * This is the only route that touches the database with the service-role key
 * while requiring no session, so each call is an unmetered RLS-bypassing
 * round-trip. Bounded per client to keep it from being an amplifier.
 */
export const inviteLinkRateLimit = () => rateLimit({ key: 'invite-link', max: 20, windowMs: 60_000 })
