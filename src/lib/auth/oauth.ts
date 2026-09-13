'use client'

/**
 * Google OAuth (PKCE) — browser side.
 *
 * Flow:
 *   1. startGoogleOAuth(): generate a code_verifier (stored in sessionStorage),
 *      POST its SHA-256 challenge to /api/auth/oauth/start, and redirect the
 *      browser to the authorize URL the server built.
 *   2. Supabase round-trips through Google and lands on /auth/callback?code=…
 *   3. That page calls exchangeCallbackCode(code): POST /api/auth/oauth/callback
 *      with the stashed verifier → the server exchanges it for a session.
 *
 * The anon key never reaches the browser; only the verifier does (it is
 * useless without the one-time auth code, and vice versa).
 */

import { api, json } from '@/lib/api/client'
import type { Session } from '@/lib/api/types'

const VERIFIER_KEY = 'echoes.oauth.verifier'

/** Random 32-byte value, base64url-encoded → 43-char verifier (RFC 7636). */
function randomCodeVerifier(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return base64Url(bytes)
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function challengeFromVerifier(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64Url(new Uint8Array(digest))
}

function stashVerifier(verifier: string): void {
  try {
    window.sessionStorage.setItem(VERIFIER_KEY, verifier)
  } catch {
    /* private mode — the callback will fail cleanly and recover */
  }
}

function popVerifier(): string | null {
  try {
    const v = window.sessionStorage.getItem(VERIFIER_KEY)
    if (v) window.sessionStorage.removeItem(VERIFIER_KEY)
    return v
  } catch {
    return null
  }
}

export interface OAuthStartResult {
  authorize_url: string
}

/** Begin the Google flow — resolves with a URL to redirect to. */
export async function startGoogleOAuth(): Promise<string> {
  const verifier = randomCodeVerifier()
  const codeChallenge = await challengeFromVerifier(verifier)
  stashVerifier(verifier)

  const result = await api<OAuthStartResult>('/api/auth/oauth/start', {
    method: 'POST',
    ...json({ provider: 'google', code_challenge: codeChallenge }),
  })
  return result.authorize_url
}

/** Complete the flow on the callback page — exchanges the one-time code. */
export async function exchangeCallbackCode(authCode: string): Promise<Session> {
  const verifier = popVerifier()
  if (!verifier) {
    throw new Error('The sign-in attempt expired or was opened in a different tab — please start again.')
  }
  return api<Session>('/api/auth/oauth/callback', {
    method: 'POST',
    ...json({ auth_code: authCode, code_verifier: verifier }),
  })
}
