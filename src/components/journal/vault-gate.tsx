'use client'

/**
 * VaultGate — the E2EE unlock prompt.
 *
 * Shows when the session is live but the key vault is locked (reload in a
 * fresh tab, OAuth/magic-link sign-in, or a password changed elsewhere).
 * The user types their password once; the vault re-derives the KEK in the
 * browser and opens the DEK. The password never leaves the page.
 *
 * Accounts without key material (pre-E2EE) get a "set up encryption" path
 * instead: it seals their existing entries under a new key the next time
 * each is saved (lazy migration), so nothing blocks reading old entries.
 */

import { useEffect, useState } from 'react'
import { LockKey, LockKeyOpen } from '@phosphor-icons/react/dist/ssr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { lock, unlock, provision } from '@/lib/crypto/vault'
import { getMyKeys } from '@/lib/api/endpoints'
import { useSession } from '@/lib/auth/session'

export function VaultGate() {
  const { user, refresh: refreshSession } = useSession()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'unlock' | 'provision' | 'checking'>('checking')

  useEffect(() => {
    // Which prompt applies: existing material → unlock; none → provision.
    getMyKeys()
      .then((k) => setMode(k.wrapped_dek ? 'unlock' : 'provision'))
      .catch(() => setMode('unlock'))
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) return setError('Passwords need at least 8 characters.')
    setBusy(true)
    setError(null)
    try {
      if (mode === 'unlock') {
        await unlock(password)
      } else {
        await provision(password)
        await refreshSession()
      }
    } catch (err) {
      setError(
        mode === 'unlock'
          ? err instanceof Error && /format|material/.test(err.message)
            ? 'This account has no key material yet — set up encryption below.'
            : 'Wrong password — the keys did not open.'
          : err instanceof Error
            ? err.message
            : "Couldn't set up encryption.",
      )
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    lock()
    const { logout } = await import('@/lib/auth/session')
    await logout()
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-paper px-6 text-ink">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5">
          <LockKey weight="duotone" className="h-6 w-6 text-clay" />
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-clay">
            {mode === 'provision' ? 'set up encryption' : 'unlock your notebooks'}
          </p>
        </div>
        <h1 className="font-display mt-4 text-3xl leading-tight tracking-tight">
          {mode === 'provision' ? 'One key, held by you alone.' : 'Your words are sealed.'}
        </h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-ink-soft">
          {mode === 'provision'
            ? 'Your entries will be encrypted on this device before they ever reach the server. Choose the password that seals them — it never leaves this browser.'
            : 'Echoes cannot read your entries — only this password opens them, and it stays here. Enter it once per tab.'}
        </p>

        <form onSubmit={submit} noValidate className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="vault-password" className="text-[12.5px] font-medium text-ink">
              {mode === 'provision' ? 'Choose a sealing password' : 'Your password'}
            </Label>
            <Input
              id="vault-password"
              type="password"
              autoComplete={mode === 'provision' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 bg-paper-raised focus-visible:ring-clay-soft"
              placeholder="the phrase that seals your words"
              autoFocus
              required
            />
          </div>
          {error && (
            <p role="alert" className="text-[12px] text-ember">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy} className="press h-10 gap-2 shadow-ink">
            {busy ? (
              'Opening…'
            ) : (
              <>
                <LockKeyOpen weight="bold" className="h-4 w-4" /> {mode === 'provision' ? 'Seal my journal' : 'Unlock'}
              </>
            )}
          </Button>
        </form>

        <p className="mt-5 font-mono text-[10px] leading-relaxed text-ink-faint">
          Signed in as {user?.email ?? 'you'} ·{' '}
          <button type="button" onClick={signOut} className="underline underline-offset-2 hover:text-ink">
            use a different account
          </button>
        </p>
      </div>
    </div>
  )
}
