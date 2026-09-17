'use client'

/**
 * The gate between an authenticated session and the journal.
 *
 * Keys are wrapped under a PIN-derived KEK, so reading anything requires the
 * user to type it. Two modes:
 *
 *   unprovisioned — the account has no key bundle yet (fresh signup via a path
 *                   that didn't collect a PIN: OAuth, magic link, invite).
 *                   Create one now.
 *   locked        — a bundle exists; unlock with the PIN.
 *
 * There is deliberately no "forgot PIN" path: the server can't derive the KEK,
 * so a forgotten PIN means the entries are gone. The copy says so plainly
 * instead of offering false hope.
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CircleNotch, LockKey, LockOpen } from '@phosphor-icons/react/dist/ssr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSession } from '@/lib/auth/session'
import { useKeyState } from '@/lib/crypto/use-vault'
import { coverMyGroups } from '@/lib/crypto/vault'

function sanitize(pin: string): string {
  return pin.replace(/\D/g, '').slice(0, 8)
}

export function PinGate() {
  const keyState = useKeyState()

  if (keyState === 'unprovisioned') return <CreatePin />
  return <UnlockPin />
}

function Shell({ title, blurb, children }: { title: string; blurb: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-paper px-5 text-ink">
      <div className="w-full max-w-sm rounded-xl border border-line bg-paper-raised p-6 shadow-lift sm:p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-clay-soft text-clay">
            <LockKey weight="duotone" className="h-6 w-6" />
          </span>
          <h2 className="font-display text-xl tracking-tight">{title}</h2>
          <p className="text-[12px] leading-relaxed text-ink-soft">{blurb}</p>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  )
}

function CreatePin() {
  const { user } = useSession()
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!/^\d{4,8}$/.test(pin)) return setError('A PIN is 4 to 8 digits.')
    if (pin !== confirm) return setError('The two PINs don’t match.')
    setBusy(true)
    try {
      const { provisionKeys } = await import('@/lib/crypto/vault')
      await provisionKeys(pin)
      // A fresh account may be joining a group that distributed its key
      // before this profile published one — heal those boxes now.
      void coverMyGroups(user?.id ?? '').catch(() => null)
      toast.success('Your journal is locked to this PIN.')
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't save the PIN — try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell
      title="Choose an encryption PIN"
      blurb="Everything you write is sealed before it leaves this browser, and the key opens with a PIN only you know."
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="create-pin" className="text-[12.5px] font-medium">
            New PIN
          </Label>
          <Input
            id="create-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(sanitize(e.target.value))}
            className="h-10 bg-paper focus-visible:ring-clay-soft"
            placeholder="4 to 8 digits"
            autoFocus
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="create-pin-confirm" className="text-[12.5px] font-medium">
            Confirm PIN
          </Label>
          <Input
            id="create-pin-confirm"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={confirm}
            onChange={(e) => setConfirm(sanitize(e.target.value))}
            className="h-10 bg-paper focus-visible:ring-clay-soft"
            placeholder="same digits again"
            required
          />
        </div>
        {error && <p className="text-[12px] text-ember">{error}</p>}
        <p className="text-[11.5px] leading-snug text-ink-faint">
          There is no recovery: if you forget this PIN, your entries cannot be read on any device — not even by us.
        </p>
        <Button type="submit" disabled={busy} className="press h-10 gap-2 shadow-ink">
          {busy ? (
            <>
              <CircleNotch weight="bold" className="h-4 w-4 animate-spin" /> Locking…
            </>
          ) : (
            'Lock my journal'
          )}
        </Button>
      </form>
    </Shell>
  )
}

function UnlockPin() {
  const { user } = useSession()
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const [passkeyOffer, setPasskeyOffer] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    // Resilient read: offline the cached bundle still reports whether a
    // passkey exists, so the offer doesn't vanish without a connection.
    void import('@/lib/crypto/bundle-store')
      .then(({ getBundle }) => getBundle())
      .then((bundle) => {
        if (alive) setPasskeyOffer(Boolean(bundle.passkey))
      })
      .catch(() => {
        if (alive) setPasskeyOffer(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const { unlockWithPin } = await import('@/lib/crypto/vault')
      await unlockWithPin(pin)
      // A returning holder is the most reliable way a group's missing boxes
      // get sealed — heal them in the background, never blocking the journal.
      void coverMyGroups(user?.id ?? '').catch(() => null)
      // The vault store emits; the gate dissolves on the next render.
    } catch (err) {
      // A wrong PIN fails the AES-GCM auth tag while unwrapping.
      setError(err instanceof Error && err.message ? err.message : 'That PIN isn’t right — try again.')
    } finally {
      setBusy(false)
    }
  }

  const unlockViaPasskey = async () => {
    setError(null)
    setPasskeyBusy(true)
    try {
      const { unlockWithPasskey } = await import('@/lib/crypto/passkey')
      await unlockWithPasskey()
      void coverMyGroups(user?.id ?? '').catch(() => null)
    } catch (err) {
      // A cancelled OS prompt resolves silently inside unlockWithPasskey —
      // only real failures (no passkey, unsupported browser) land here.
      setError(err instanceof Error && err.message ? err.message : 'That didn’t unlock — try the PIN.')
    } finally {
      setPasskeyBusy(false)
    }
  }

  return (
    <Shell
      title="Enter your PIN"
      blurb="Unlocks this browser and remembers it for 30 days — Lock now in the menu forgets it again."
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="unlock-pin" className="text-[12.5px] font-medium">
            PIN
          </Label>
          <Input
            id="unlock-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(sanitize(e.target.value))}
            className="h-10 bg-paper focus-visible:ring-clay-soft"
            placeholder="4 to 8 digits"
            autoFocus
            required
          />
        </div>
        {error && <p className="text-[12px] text-ember">{error}</p>}
        <Button type="submit" disabled={busy || passkeyBusy} className="press h-10 gap-2 shadow-ink">
          {busy ? (
            <>
              <CircleNotch weight="bold" className="h-4 w-4 animate-spin" /> Unlocking…
            </>
          ) : (
            <>
              <LockOpen weight="bold" className="h-4 w-4" /> Unlock
            </>
          )}
        </Button>
        {passkeyOffer && (
          <Button
            type="button"
            variant="outline"
            disabled={busy || passkeyBusy}
            onClick={() => void unlockViaPasskey()}
            className="press h-10 gap-2 border-line bg-paper"
          >
            {passkeyBusy ? (
              <>
                <CircleNotch weight="bold" className="h-4 w-4 animate-spin" /> Waiting for your passkey…
              </>
            ) : (
              'Use a passkey instead'
            )}
          </Button>
        )}
        <p className="text-[11.5px] leading-snug text-ink-faint">
          Forgot it? Your entries stay sealed permanently — we can’t reset a PIN we never see.
        </p>
      </form>
    </Shell>
  )
}
