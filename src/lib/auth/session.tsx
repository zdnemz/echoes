'use client'

/**
 * Session — an external store read through useSyncExternalStore.
 *
 * Hydration contract: the SERVER snapshot is always { user: null, status:
 * "restoring" }, and React uses getServerSnapshot during hydration, so
 * server and client markup agree by construction. localStorage is read by
 * the restore() task (kicked off by <SessionProvider> in an effect), never
 * during render — no hydration surface, no setState-in-effect.
 */

import { useEffect, type ReactNode } from 'react'
import { useSyncExternalStore } from 'react'
import type { AuthUser, Session } from '@/lib/api/types'
import * as api from '@/lib/api/endpoints'
import { getToken, isUnauthorized, persistSession, readStoredUser, setToken, storeUser } from '@/lib/api/client'

export type SessionStatus = 'restoring' | 'authenticated' | 'anonymous'

interface SessionState {
  user: AuthUser | null
  status: SessionStatus
}

const SERVER_STATE: SessionState = { user: null, status: 'restoring' }
let state: SessionState = SERVER_STATE
const listeners = new Set<() => void>()
let restored = false

function setState(next: Partial<SessionState>) {
  state = { ...state, ...next }
  for (const l of listeners) l()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => state
const getServerSnapshot = () => SERVER_STATE

/** One-time token restore + server validation. */
async function restore(): Promise<void> {
  if (restored) return
  restored = true

  const token = getToken()
  const stored = readStoredUser() as AuthUser | null

  if (!token) {
    setState({ status: 'anonymous' })
    return
  }

  // Optimistically surface the cached user while the token is verified.
  if (stored) setState({ user: stored, status: 'authenticated' })

  try {
    const fresh = await api.getMe()
    storeUser(fresh)
    setState({ user: fresh, status: 'authenticated' })
  } catch (err) {
    if (isUnauthorized(err)) {
      setToken(null)
      storeUser(null)
      setState({ user: null, status: 'anonymous' })
    } else if (stored) {
      // Server unreachable or unconfigured — keep the cached session; data
      // queries will surface the right notice themselves.
      setState({ status: 'authenticated' })
    } else {
      setState({ status: 'anonymous' })
    }
  }
}

// ---------------------------------------------------------------- actions

function applySession(session: Session | null): AuthUser | null {
  if (!session) {
    setToken(null)
    storeUser(null)
    setState({ user: null, status: 'anonymous' })
    return null
  }
  persistSession(session)
  setState({ user: session.user, status: 'authenticated' })
  return session.user
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const session = await api.login({ email, password })
  return applySession(session) as AuthUser
}

export async function signup(email: string, password: string, displayName?: string): Promise<AuthUser | null> {
  const session = await api.signUp({
    email,
    password,
    ...(displayName ? { display_name: displayName } : {}),
  })
  return applySession(session)
}

export async function logout(): Promise<void> {
  try {
    await api.logout()
  } catch {
    // best-effort server revocation; the token is dropped regardless
  }
  applySession(null)
}

export async function refresh(): Promise<void> {
  try {
    const fresh = await api.getMe()
    storeUser(fresh)
    setState({ user: fresh, status: 'authenticated' })
  } catch (err) {
    if (isUnauthorized(err)) applySession(null)
  }
}

/** Adopt a session obtained elsewhere (e.g. invite flow). */
export function adoptSession(session: Session): AuthUser {
  return applySession(session) as AuthUser
}

// ---------------------------------------------------------------- provider + hook

/** Mounts the one-time restore; children render regardless. */
export function SessionProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void restore()
    // The API client rotates tokens transparently (api.ts) and emits this
    // event when a refresh brought back fresher user data — mirror it here
    // so subscribers see the update without a re-fetch.
    const onRefreshed = (event: Event) => {
      const user = (event as CustomEvent<AuthUser>).detail
      if (user && state.status === 'authenticated') setState({ user })
    }
    window.addEventListener('echoes:session-refreshed', onRefreshed)
    return () => window.removeEventListener('echoes:session-refreshed', onRefreshed)
  }, [])
  return <>{children}</>
}

export interface SessionContextValue {
  user: AuthUser | null
  status: SessionStatus
  login: typeof login
  signup: typeof signup
  logout: typeof logout
  refresh: typeof refresh
  adoptSession: typeof adoptSession
}

export function useSession(): SessionContextValue {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return {
    user: snap.user,
    status: snap.status,
    login,
    signup,
    logout,
    refresh,
    adoptSession,
  }
}
