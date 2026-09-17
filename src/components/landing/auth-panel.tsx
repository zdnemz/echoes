'use client'

/**
 * The auth panel — sign in / create account / magic link.
 * Form rules: label above input, helper text under, error text below, gap-2.
 * Handles the full interaction cycle: loading, inline errors, the 503
 * unconfigured state, email-confirmation-pending signups, dev magic links,
 * and the pending-invite flow (auto-join after first sign-in).
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { UnconfiguredNotice } from '@/components/unconfigured'
import { useCopy } from '@/hooks/use-copy'
import { useRovingSelection } from '@/hooks/use-roving-selection'
import { useSession } from '@/lib/auth/session'
import { isUnconfigured } from '@/lib/api/client'
import { startGoogleOAuth } from '@/lib/auth/oauth'
import { clearPendingInvite, popPendingInvite } from '@/lib/auth/invite-stash'
import { Check, CircleNotch, Copy, PaperPlaneTilt } from '@phosphor-icons/react/dist/ssr'

export { stashPendingInvite } from '@/lib/auth/invite-stash'

// ---------------------------------------------------------------- field

function Field({
  id,
  label,
  helper,
  error,
  children,
}: {
  id: string
  label: string
  helper?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-[12.5px] font-medium text-ink">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[11.5px] leading-snug text-ember">
          {error}
        </p>
      ) : helper ? (
        <p id={`${id}-helper`} className="text-[11.5px] leading-snug text-ink-faint">
          {helper}
        </p>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------- google mark

/** The standard four-color Google "G" (brand-correct, no image asset). */
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" className={className}>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91a8.78 8.78 0 0 0 2.69-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.8.54-1.84.86-3.05.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.34A9 9 0 0 0 9 18z"
      />
      <path fill="#FBBC05" d="M3.95 10.7a5.41 5.41 0 0 1 0-3.4V4.96H.96a9 9 0 0 0 0 8.08l2.99-2.34z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l2.99 2.34C4.66 5.17 6.65 3.58 9 3.58z"
      />
    </svg>
  )
}

// ---------------------------------------------------------------- panel

const AUTH_TABS = ['signin', 'signup', 'magic'] as const

export function AuthPanel({ initialTab = 'signin' }: { initialTab?: 'signin' | 'signup' | 'magic' }) {
  const router = useRouter()
  const { login, signup, status: sessionStatus } = useSession()

  const [tab, setTab] = useState<'signin' | 'signup' | 'magic'>(initialTab)
  const tabKeys = useRovingSelection({ values: AUTH_TABS, selected: tab, onSelect: setTab })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unconfigured, setUnconfigured] = useState(false)
  const [confirmationPending, setConfirmationPending] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [displayName, setDisplayName] = useState('')

  const [magicEmail, setMagicEmail] = useState('')
  const [magicSent, setMagicSent] = useState<{ message: string; dev_link: string | null } | null>(null)
  const { copied, copy } = useCopy({
    onError: () => toast.error("Couldn't copy — select the link and copy it manually."),
  })
  const [oauthBusy, setOauthBusy] = useState(false)
  const [oauthError, setOauthError] = useState<string | null>(null)

  // A stashed invite link sends the fresh session back to the accept page,
  // which finishes the join (instantly or as a request).
  const enterJournal = async () => {
    const stashed = popPendingInvite()
    if (stashed) {
      clearPendingInvite()
      router.push(`/invites/accept?token=${encodeURIComponent(stashed.token)}`)
      return
    }
    const params = new URLSearchParams(window.location.search)
    const returnTo = params.get('return_to')
    if (returnTo && returnTo.startsWith('/journal') && !returnTo.startsWith('//') && !returnTo.includes('\\')) {
      router.push(returnTo)
      return
    }
    router.push('/journal')
  }

  const fail = (err: unknown, fallback: string) => {
    if (isUnconfigured(err)) {
      setUnconfigured(true)
      return
    }
    setError(err instanceof Error && err.message ? err.message : fallback)
  }

  const handleGoogle = async () => {
    setOauthError(null)
    setUnconfigured(false)
    setOauthBusy(true)
    try {
      const url = await startGoogleOAuth()
      window.location.assign(url) // full navigation — the flow leaves the app
    } catch (err) {
      if (isUnconfigured(err)) {
        setUnconfigured(true)
      } else {
        setOauthError(err instanceof Error && err.message ? err.message : "Couldn't start Google sign-in.")
      }
      setOauthBusy(false)
    }
  }

  // Already signed in? Straight to the journal (or return target).
  useEffect(() => {
    if (sessionStatus === 'authenticated') {
      const params = new URLSearchParams(window.location.search)
      const returnTo = params.get('return_to')
      if (returnTo && returnTo.startsWith('/journal') && !returnTo.startsWith('//') && !returnTo.includes('\\')) {
        router.replace(returnTo)
        return
      }
      router.replace('/journal')
    }
  }, [sessionStatus, router])

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setUnconfigured(false)
    if (!email.includes('@')) return setError("That doesn't look like an email address.")
    if (password.length < 1) return setError('Enter your password.')
    setBusy(true)
    try {
      await login(email, password)
      await enterJournal()
    } catch (err) {
      fail(err, 'Sign-in failed — check the address and password.')
    } finally {
      setBusy(false)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setUnconfigured(false)
    setConfirmationPending(false)
    if (displayName.length > 80) return setError('Display name is too long.')
    if (!email.includes('@')) return setError("That doesn't look like an email address.")
    if (password.length < 8) return setError('Passwords need at least 8 characters.')
    if (!/^\d{4,8}$/.test(pin)) return setError('A PIN of 4 to 8 digits keeps your notes readable on a new device.')
    setBusy(true)
    try {
      const fresh = await signup(email, password, displayName || undefined)
      if (!fresh) {
        setConfirmationPending(true)
        setTab('signin')
        return
      }
      // The account's encryption keys are minted now, wrapped under this PIN.
      // Nothing leaves the browser but the wrapped blobs.
      const { provisionKeys } = await import('@/lib/crypto/vault')
      await provisionKeys(pin)
      // Nameless accounts finish onboarding first — the stash (if any)
      // waits in storage for the welcome page to consume.
      if (!(fresh.display_name ?? '').trim()) {
        router.push('/welcome')
        return
      }
      await enterJournal()
    } catch (err) {
      fail(err, "Couldn't create the account.")
    } finally {
      setBusy(false)
    }
  }

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setUnconfigured(false)
    setMagicSent(null)
    if (!magicEmail.includes('@')) return setError("That doesn't look like an email address.")
    setBusy(true)
    try {
      const { requestMagicLink } = await import('@/lib/api/endpoints')
      const result = await requestMagicLink(magicEmail, `${window.location.origin}/journal`)
      setMagicSent(result)
    } catch (err) {
      fail(err, "Couldn't send the link.")
    } finally {
      setBusy(false)
    }
  }

  const copyDevLink = () => {
    if (!magicSent?.dev_link) return
    void copy(magicSent.dev_link)
  }

  return (
    <div
      id="begin-panel"
      className="w-full max-w-md border-2 border-foreground bg-background p-6 text-foreground shadow-brutal sm:p-8"
    >
      <h3 className="font-display text-2xl uppercase">Your notebooks await</h3>
      <p className="mt-2 border-l-4 border-accent pl-3 text-[12.5px] font-bold leading-relaxed">
        One account, private by default. Share later, only if you want to.
      </p>

      {unconfigured && (
        <div className="mt-5">
          <UnconfiguredNotice />
        </div>
      )}

      {oauthError && <p className="mt-4 text-[12px] text-ember">{oauthError}</p>}

      {/* Google OAuth — the one-click path. */}
      <Button
        type="button"
        variant="outline"
        disabled={oauthBusy || busy}
        onClick={handleGoogle}
        className="mt-5 h-10 w-full gap-2.5"
      >
        {oauthBusy ? (
          <>
            <CircleNotch weight="bold" className="h-4 w-4 animate-spin" /> Redirecting to Google…
          </>
        ) : (
          <>
            <GoogleMark className="h-4.5 w-4.5" /> Continue with Google
          </>
        )}
      </Button>

      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-0.5 flex-1 bg-foreground" />
        <span className="bg-foreground px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-background">
          or use email
        </span>
        <span className="h-0.5 flex-1 bg-foreground" />
      </div>

      {confirmationPending && (
        <div role="status" className="mt-5 border-2 border-foreground bg-muted px-4 py-3 text-[12.5px] font-bold">
          Account created — confirm the email we just sent, then sign in below.
        </div>
      )}

      <div className="mt-6">
        <div
          role="tablist"
          aria-label="Sign-in methods"
          onKeyDown={tabKeys.onKeyDown}
          className="grid w-full grid-cols-3 items-center justify-center border-2 border-foreground bg-muted p-1"
        >
          {(
            [
              { value: 'signin', label: 'Sign in' },
              { value: 'signup', label: 'Create account' },
              { value: 'magic', label: 'Magic link' },
            ] as const
          ).map((t) => (
            <button
              key={t.value}
              ref={tabKeys.registerItem(t.value)}
              type="button"
              role="tab"
              id={`auth-tab-${t.value}`}
              aria-controls={`auth-panel-${t.value}`}
              aria-selected={tab === t.value}
              tabIndex={tabKeys.tabIndexFor(t.value)}
              onClick={() => setTab(t.value)}
              className={`inline-flex items-center justify-center whitespace-nowrap px-3 py-2 font-mono text-[12px] font-bold uppercase transition-colors ${
                tab === t.value ? 'bg-foreground text-background' : 'hover:bg-background'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ---------------------------------------------- sign in */}
        {tab === 'signin' && (
          <div role="tabpanel" id="auth-panel-signin" aria-labelledby="auth-tab-signin" className="mt-5">
            <form onSubmit={handleSignIn} noValidate className="flex flex-col gap-4">
              <Field id="signin-email" label="Email">
                <Input
                  id="signin-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-10 font-bold"
                  placeholder="you@wherever.com"
                  required
                />
              </Field>
              <Field id="signin-password" label="Password">
                <Input
                  id="signin-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 font-bold"
                  placeholder="your password"
                  required
                />
              </Field>
              {error && tab === 'signin' && (
                <p className="border-2 border-destructive px-3 py-2 text-[12px] font-bold text-destructive">{error}</p>
              )}
              <Button type="submit" disabled={busy} className="h-10 gap-2">
                {busy ? (
                  <>
                    <CircleNotch weight="bold" className="h-4 w-4 animate-spin" /> Signing in…
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>
            </form>
          </div>
        )}

        {/* ---------------------------------------------- sign up */}
        {tab === 'signup' && (
          <div role="tabpanel" id="auth-panel-signup" aria-labelledby="auth-tab-signup" className="mt-5">
            <form onSubmit={handleSignUp} noValidate className="flex flex-col gap-4">
              <Field id="signup-name" label="Display name" helper="Optional — what your shared notebooks call you.">
                <Input
                  id="signup-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="h-10 font-bold"
                  placeholder="Maya Lindqvist"
                  autoComplete="name"
                />
              </Field>
              <Field id="signup-email" label="Email">
                <Input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-10 font-bold"
                  placeholder="you@wherever.com"
                  required
                />
              </Field>
              <Field id="signup-password" label="Password" helper="At least 8 characters.">
                <Input
                  id="signup-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-10 font-bold"
                  placeholder="a phrase you'll remember"
                  required
                />
              </Field>
              <Field
                id="signup-pin"
                label="Encryption PIN"
                helper="4–8 digits. Unlocks your notes on any new device — there is no recovery without it, so pick something you'll remember."
              >
                <Input
                  id="signup-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  className="h-10 font-bold"
                  placeholder="4 to 8 digits"
                  required
                />
              </Field>
              {error && tab === 'signup' && (
                <p className="border-2 border-destructive px-3 py-2 text-[12px] font-bold text-destructive">{error}</p>
              )}
              <Button type="submit" disabled={busy} className="h-10 gap-2">
                {busy ? (
                  <>
                    <CircleNotch weight="bold" className="h-4 w-4 animate-spin" /> Creating…
                  </>
                ) : (
                  'Create account'
                )}
              </Button>
            </form>
          </div>
        )}

        {/* ---------------------------------------------- magic link */}
        {tab === 'magic' && (
          <div role="tabpanel" id="auth-panel-magic" aria-labelledby="auth-tab-magic" className="mt-5">
            <form onSubmit={handleMagicLink} noValidate className="flex flex-col gap-4">
              <Field id="magic-email" label="Email" helper="We send a one-time sign-in link. No password needed.">
                <Input
                  id="magic-email"
                  type="email"
                  autoComplete="email"
                  value={magicEmail}
                  onChange={(e) => setMagicEmail(e.target.value)}
                  className="h-10 font-bold"
                  placeholder="you@wherever.com"
                  required
                />
              </Field>
              {error && tab === 'magic' && (
                <p className="border-2 border-destructive px-3 py-2 text-[12px] font-bold text-destructive">{error}</p>
              )}
              <Button type="submit" disabled={busy} className="h-10 gap-2">
                {busy ? (
                  <>
                    <CircleNotch weight="bold" className="h-4 w-4 animate-spin" /> Sending…
                  </>
                ) : (
                  <>
                    <PaperPlaneTilt weight="bold" className="h-4 w-4" /> Send the link
                  </>
                )}
              </Button>
            </form>

            {magicSent && (
              <div className="mt-5 border-2 border-foreground bg-muted px-4 py-3.5">
                <p className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
                  <Check weight="bold" className="h-4 w-4 text-sage" /> {magicSent.message}
                </p>
                {magicSent.dev_link && (
                  <div className="mt-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                      dev mode — the link itself
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <code className="min-w-0 flex-1 truncate border-2 border-foreground bg-background px-2.5 py-1.5 font-mono text-[10.5px] font-bold">
                        {magicSent.dev_link}
                      </code>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={copyDevLink}
                        aria-label="Copy the dev magic link"
                      >
                        {copied ? (
                          <Check weight="bold" className="h-3.5 w-3.5 text-sage" />
                        ) : (
                          <Copy weight="regular" className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
