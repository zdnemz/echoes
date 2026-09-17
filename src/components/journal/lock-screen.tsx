'use client'

/**
 * The lock screen — a full-viewport overlay over the journal while the vault is
 * locked. Views stay mounted underneath (an unsaved draft survives the lock),
 * but nothing new can decrypt: the vault holds no keys until one of the
 * configured methods unwaps them.
 */

import { useEffect, useState } from 'react'
import { Fingerprint, LockOpen, SignOut } from '@phosphor-icons/react/dist/ssr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Wordmark } from '@/components/brand'
import { Grain } from '@/components/grain'
import { useSession } from '@/lib/auth/session'
import {
  getAppLockMethods,
  isBrokenLock,
  resetBrokenLock,
  unlockWithPasskey,
  unlockWithPin,
} from '@/lib/crypto/app-lock'

export function LockScreen() {
  const { logout } = useSession()
  const methods = getAppLockMethods()
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [broken, setBroken] = useState(false)

  // ponytail: passkey-only devices still need a visible trigger here — some
  // browsers require a user gesture before the OS prompt can appear.
  const tryPasskey = async () => {
    setError(null)
    setBusy(true)
    try {
      await unlockWithPasskey()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That passkey did not unlock the journal.')
    } finally {
      setBusy(false)
    }
  }

  const tryPin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await unlockWithPin(pin)
    } catch {
      setPin('')
      setError('That PIN is not right — try again.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void isBrokenLock().then(setBroken)
  }, [])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Journal locked"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-paper px-6 text-ink"
    >
      <Grain />
      <div className="flex w-full max-w-sm flex-col">
        <Wordmark className="text-lg" />
        <h1 className="font-display mt-8 text-3xl leading-tight tracking-tight">Locked.</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
          Your entries are sealed on this device until you unlock them.
        </p>

        {broken ? (
          <div className="mt-7 rounded-xl border border-line bg-paper-raised p-5">
            <p className="text-[13px] leading-relaxed text-ink-soft">
              The lock on this device can’t be found — its wrapped keys were removed, so the journal sealed under it
              can’t be reopened. Removing the lock starts a fresh, empty key set on this device.
            </p>
            <Button
              type="button"
              variant="outline"
              className="press mt-4 h-9 gap-1.5 border-line bg-paper"
              onClick={() => void resetBrokenLock()}
            >
              Remove the broken lock
            </Button>
          </div>
        ) : (
          <div className="mt-7 flex flex-col gap-4">
            {methods.pin && (
              <form onSubmit={tryPin} className="flex flex-col gap-3">
                <Input
                  // digit pad on mobile, hidden glyphs on desktop
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  pattern="\d*"
                  maxLength={8}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="enter your PIN"
                  aria-label="PIN"
                  aria-invalid={error ? 'true' : 'false'}
                  className="h-11 bg-paper-raised text-center font-mono text-lg tracking-[0.3em] focus-visible:ring-clay-soft"
                  autoFocus
                  disabled={busy}
                />
                <Button type="submit" disabled={busy || pin.length < 4} className="press h-10 gap-1.5 shadow-ink">
                  {busy ? (
                    <>
                      <LockOpen weight="bold" className="h-4 w-4 animate-spin" /> Unlocking…
                    </>
                  ) : (
                    <>
                      <LockOpen weight="bold" className="h-4 w-4" /> Unlock
                    </>
                  )}
                </Button>
              </form>
            )}

            {methods.pin && methods.passkey && (
              <div className="flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-line" />
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">or</span>
                <span className="h-px flex-1 bg-line" />
              </div>
            )}

            {methods.passkey && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={tryPasskey}
                className="press h-10 gap-2 border-line bg-paper"
              >
                {busy ? (
                  <>
                    <Fingerprint weight="bold" className="h-4 w-4 animate-spin" /> Waiting for passkey…
                  </>
                ) : (
                  <>
                    <Fingerprint weight="bold" className="h-4 w-4" /> Unlock with passkey
                  </>
                )}
              </Button>
            )}

            {error && (
              <p role="alert" className="text-[12.5px] leading-snug text-ember">
                {error}
              </p>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => logout()}
          className="press mt-8 inline-flex items-center gap-1.5 self-start font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint hover:text-ember"
        >
          <SignOut weight="bold" className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>
    </div>
  )
}
