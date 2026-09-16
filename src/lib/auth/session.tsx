'use client'

import { useEffect, type ReactNode } from 'react'
import { useSyncExternalStore } from 'react'
import type { AuthUser, Session } from '@/lib/api/types'
import * as api from '@/lib/api/endpoints'
import { getToken, isUnauthorized, persistSession, readStoredUser, setToken, storeUser } from '@/lib/api/client'
import { ensureKeys, lock as vaultLock } from '@/lib/crypto/vault'

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

async function restore(): Promise<void> {
  if (restored) return
  restored = true

  const token = getToken()
  const stored = readStoredUser() as AuthUser | null

  if (!token) {
    setState({ status: 'anonymous' })
    return
  }

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
      setState({ status: 'authenticated' })
    } else {
      setState({ status: 'anonymous' })
    }
  }
}

function applySession(session: Session | null): AuthUser | null {
  if (!session) {
    setToken(null)
    storeUser(null)
    setState({ user: null, status: 'anonymous' })
    return null
  }
  persistSession(session)
  setState({ user: session.user, status: 'authenticated' })
  // Keys live here — not in login/signup/adopt separately — so every way of
  // becoming authenticated (password, OAuth, magic link, invite) provisions
  // this device's key before anything tries to seal or open entries.
  void ensureKeys().catch(() => {})
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
  } catch {}
  vaultLock()
  applySession(null)
}

export async function refresh(): Promise<void> {
  try {
    const fresh = await api.getMe()
    storeUser(fresh)
    setState({ user: fresh, status: 'authenticated' })
  } catch (err) {
    if (isUnauthorized(err)) {
      vaultLock()
      applySession(null)
    }
  }
}

export function adoptSession(session: Session): AuthUser {
  return applySession(session) as AuthUser
}

export function SessionProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void restore().then(() => {
      void ensureKeys()
    })
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
