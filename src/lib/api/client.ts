'use client'

/**
 * Typed fetch client for the Echoes API.
 *
 * - Relative paths only (same origin — the Hono API is mounted at /api).
 * - Parses the `{ error: { code, message, details } }` envelope into ApiError.
 * - `isUnconfigured()` detects the 503 SUPABASE_NOT_CONFIGURED response so
 *   the UI can render a calm "backend not connected yet" state instead of
 *   a wall of error toasts.
 */

const TOKEN_KEY = 'echoes.session.token'
const REFRESH_KEY = 'echoes.session.refresh'
const SESSION_KEY = 'echoes.session.user'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30

function setCookie(token: string | null) {
  if (typeof window === 'undefined') return
  if (token) {
    document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
  } else {
    document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`
  }
}

export class ApiError extends Error {
  status: number
  code: string
  details: unknown

  constructor(status: number, code: string, message: string, details: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/** True when an error means "this deployment has no Supabase keys yet". */
export function isUnconfigured(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    err.status === 503 &&
    (err.code === 'SUPABASE_NOT_CONFIGURED' ||
      err.code === 'SERVICE_ROLE_NOT_CONFIGURED' ||
      err.code === 'SCHEMA_NOT_READY')
  )
}

/** True when an error means "the bearer token is missing/invalid/expired". */
export function isUnauthorized(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 401 || err.code === 'UNAUTHORIZED')
}

/**
 * True when the request never reached the server — offline, DNS, dropped
 * connection. Callers route these to the offline outbox instead of failing.
 */
export function isNetworkDrop(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 0 || err.code === 'NETWORK')
}

// ---------------------------------------------------------------- token store
// Module-level token cache, persisted to localStorage. Read lazily and only
// from event handlers / effects (client), so first paint never depends on it.

let cachedToken: string | null = null
let cachedRefreshToken: string | null = null
let tokenRead = false

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  if (!tokenRead) {
    tokenRead = true
    cachedToken = window.localStorage.getItem(TOKEN_KEY)
    cachedRefreshToken = window.localStorage.getItem(REFRESH_KEY)
  }
  return cachedToken
}

export function setToken(token: string | null) {
  cachedToken = token
  tokenRead = true
  setCookie(token)
  if (typeof window === 'undefined') return
  if (token === null) {
    window.localStorage.removeItem(TOKEN_KEY)
    cachedRefreshToken = null
    window.localStorage.removeItem(REFRESH_KEY)
  } else window.localStorage.setItem(TOKEN_KEY, token)
}

function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null
  if (!tokenRead) getToken()
  return cachedRefreshToken
}

function setRefreshToken(refreshToken: string | null) {
  cachedRefreshToken = refreshToken
  if (typeof window === 'undefined') return
  if (refreshToken === null) window.localStorage.removeItem(REFRESH_KEY)
  else window.localStorage.setItem(REFRESH_KEY, refreshToken)
}

export function readStoredUser(): unknown {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as unknown) : null
  } catch {
    return null
  }
}

export function storeUser(user: unknown) {
  if (typeof window === 'undefined') return
  if (user === null) window.localStorage.removeItem(SESSION_KEY)
  else window.localStorage.setItem(SESSION_KEY, JSON.stringify(user))
}

/** Persist the full session (token + refresh token + user). */
export function persistSession(session: { access_token: string; refresh_token?: string | null; user: unknown }): void {
  setToken(session.access_token)
  setRefreshToken(session.refresh_token ?? null)
  storeUser(session.user)
}

// ---------------------------------------------------------------- fetch core

/**
 * One refresh at a time, shared across concurrent 401s. Bare fetch — never
 * api() — so the refresh call itself can't recurse.
 */
let refreshInFlight: Promise<boolean> | null = null

/**
 * `fetch` with a deadline. A dead network that `navigator.onLine` still calls
 * online would otherwise leave the promise pending for a minute or more; the
 * timeout turns that into an ordinary AbortError the caller maps to a NETWORK
 * drop. A caller-supplied `signal` still wins — we abort on whichever fires
 * first, and clear the timer so a resolved response leaves no dangling handle.
 */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const caller = init.signal
  const onCallerAbort = () => controller.abort()
  caller?.addEventListener('abort', onCallerAbort)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
    caller?.removeEventListener('abort', onCallerAbort)
  }
}

async function tryRefreshSession(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        })
        if (!res.ok) return false
        const session = (await res.json()) as {
          access_token: string
          refresh_token: string | null
          user?: unknown
        }
        if (!session?.access_token) return false
        setToken(session.access_token)
        setRefreshToken(session.refresh_token)
        if (session.user) {
          storeUser(session.user)
          window.dispatchEvent(new CustomEvent('echoes:session-refreshed', { detail: session.user }))
        }
        return true
      } catch {
        return false
      } finally {
        refreshInFlight = null
      }
    })()
  }
  return refreshInFlight
}

/**
 * How long a request may hang before it is treated as a network drop. The
 * browser's own `navigator.onLine` is not trustworthy — turning wifi off often
 * leaves it `true`, so the fetch above never runs and `fetch` below sits on a
 * dead socket (tens of seconds, sometimes forever). Every offline path keys off
 * a NETWORK error arriving promptly: without this the vault stays 'resolving'
 * behind a skeleton, and an offline write never reaches the outbox.
 */
const REQUEST_TIMEOUT_MS = 8_000

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  // Offline: fail fast as a NETWORK drop rather than issuing a fetch the
  // browser will reject anyway. This is the one place every caller funnels
  // through, so it kills the whole family of redundant offline traffic at
  // once — the health/status polls and group refetchIntervals that would
  // otherwise hammer a dead interface on every tick, and the session restore
  // that would sit on its skeleton until each one times out. Every caller
  // already routes NETWORK drops to the offline layer: session falls back to
  // the stored user, the key bundle to its cache, and writes to the outbox.
  // Strict false: non-browser runtimes (Bun's test runner, the e2e scripts)
  // expose `navigator` without `onLine`, and an undefined there must not be
  // read as "offline".
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ApiError(0, 'NETWORK', 'Could not reach the server', 'offline')
  }

  let token = getToken()
  const headers = new Headers(init?.headers)
  if (!headers.has('content-type') && init?.body) headers.set('content-type', 'application/json')
  if (token) headers.set('authorization', `Bearer ${token}`)

  let res: Response
  try {
    res = await fetchWithTimeout(path, { ...init, headers })
  } catch (cause) {
    // A caller-supplied abort is a cancellation, not a dead network — let the
    // original reason surface instead of pretending the server was unreachable.
    if (cause instanceof DOMException && cause.name === 'AbortError' && init?.signal?.aborted) throw cause
    throw new ApiError(0, 'NETWORK', 'Could not reach the server', String(cause))
  }

  // Access token expired? Rotate it once and retry the original request.
  if (res.status === 401 && token && !path.startsWith('/api/auth/refresh')) {
    const refreshed = await tryRefreshSession()
    if (refreshed) {
      const retryHeaders = new Headers(init?.headers)
      if (!retryHeaders.has('content-type') && init?.body) retryHeaders.set('content-type', 'application/json')
      retryHeaders.set('authorization', `Bearer ${getToken()}`)
      try {
        res = await fetchWithTimeout(path, { ...init, headers: retryHeaders })
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError' && init?.signal?.aborted) throw cause
        throw new ApiError(0, 'NETWORK', 'Could not reach the server', String(cause))
      }
      if (res.status === 401) {
        // Refresh granted but the retry still 401s — the token is genuinely
        // unusable. Drop the session so the UI falls back to signed-out.
        setToken(null)
        storeUser(null)
      }
    }
  }

  if (res.status === 204) return undefined as T

  let body: unknown = null
  const text = await res.text()
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }

  if (!res.ok) {
    const envelope =
      body && typeof body === 'object' && 'error' in body
        ? ((body as { error: { code?: string; message?: string; details?: unknown } }).error ?? {})
        : {}
    throw new ApiError(
      res.status,
      envelope.code ?? `HTTP_${res.status}`,
      envelope.message ?? `Request failed (${res.status})`,
      envelope.details ?? null,
    )
  }

  return body as T
}

export function json(body: unknown): RequestInit {
  return { body: JSON.stringify(body) }
}
