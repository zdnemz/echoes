'use client'

/**
 * Settings — profile, account, preferences and app info in one place.
 * Sections:
 *  - Profile: display name (PATCH /api/auth/profile).
 *  - Account: email + user id (read-only), password change, sign out.
 *  - Preferences: local-only, honored immediately (default compose mood).
 *  - App: backend status, version, legal links.
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ArrowSquareOut, Check, CircleNotch, Copy } from '@phosphor-icons/react/dist/ssr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MOODS, MOOD_META, MoodGlyph, type Mood } from '@/components/mood/glyphs'
import { useCopy } from '@/hooks/use-copy'
import { useRovingSelection } from '@/hooks/use-roving-selection'
import { useSession } from '@/lib/auth/session'
import { InstallAppSection } from '@/components/pwa/install-app-section'
import { usePendingCount } from '@/lib/offline/use-outbox-sync'
import { getDefaultMood, getGroupLayout, setDefaultMood, setGroupLayout, type GroupLayout } from '@/lib/prefs'

/** Explicit "none" first: a radiogroup must always have a checked member. */
const MOOD_OPTIONS: Array<Mood | null> = [null, ...MOODS]
import { useHealth } from '@/lib/api/hooks'
import { updatePassword, updateProfile } from '@/lib/api/endpoints'
import { useEncryptMigration } from '@/lib/crypto/migrate'
import { lock as lockVault } from '@/lib/crypto/vault'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-paper-raised p-5 sm:p-6">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-clay">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3.5 first:border-t-0 first:pt-0 last:pb-0">
      <p className="text-[13px] font-medium text-ink">{label}</p>
      <div className="flex min-w-0 items-center gap-2">{children}</div>
    </div>
  )
}

/**
 * Privacy state, in plain words: the mechanism is invisible and automatic,
 * so this only ever reports "it is on" and whether older entries from before
 * the switch are still being converted. No jargon, nothing to configure.
 */
function PrivacyStatus() {
  const { status } = useSession()
  const migration = useEncryptMigration()
  return (
    <>
      <Row label="Your words stay yours">
        {status !== 'authenticated' ? (
          <span className="font-mono text-[12px] text-ink-faint">—</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-sage">
            <Check weight="bold" className="h-3.5 w-3.5" /> only readable here
          </span>
        )}
      </Row>
      {migration.running || migration.remaining > 0 || migration.migrated > 0 ? (
        <Row label="Protecting older entries">
          <span className="font-mono text-[12px] text-ink-soft">
            {migration.running
              ? `working… ${migration.migrated} done`
              : migration.remaining > 0
                ? `${migration.remaining} remaining`
                : `${migration.migrated} done`}
          </span>
        </Row>
      ) : null}
      <p className="mt-1 text-[11.5px] leading-relaxed text-ink-faint">
        Everything you write is locked to this device before it reaches our servers — nobody else, not even us, can read
        it. Moods, tags and timestamps stay searchable.
      </p>
    </>
  )
}

function SyncStatus() {
  const pending = usePendingCount()
  if (pending === 0) return null
  return (
    <Row label="Offline changes">
      <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-clay">
        <CircleNotch weight="bold" className="h-3.5 w-3.5 animate-spin" /> {pending} waiting for a connection
      </span>
    </Row>
  )
}

export function SettingsView() {
  const { user, logout, refresh } = useSession()
  const health = useHealth()

  // ---- profile
  const [name, setName] = useState<string | null>(null)
  const [savingName, setSavingName] = useState(false)

  // ---- password
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [savingPw, setSavingPw] = useState(false)

  const [oldPin, setOldPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [savingPin, setSavingPin] = useState(false)

  const [passkeySet, setPasskeySet] = useState<boolean | null>(null)
  const [savingPasskey, setSavingPasskey] = useState(false)

  // Declared before the early return below: hooks must run on every render.
  useEffect(() => {
    let alive = true
    void import('@/lib/crypto/bundle-store')
      .then(({ getBundle }) => getBundle())
      .then((bundle) => {
        if (alive) setPasskeySet(Boolean(bundle.passkey))
      })
      .catch(() => {
        if (alive) setPasskeySet(false)
      })
    return () => {
      alive = false
    }
  }, [])

  // ---- preferences (local-only; state mirrors localStorage)
  const [defaultMood, setDefaultMoodState] = useState<Mood | null>(() => getDefaultMood())
  const [groupLayout, setGroupLayoutState] = useState<GroupLayout>(() => getGroupLayout())

  // ---- misc
  const { copied, copy } = useCopy({
    onError: () => toast.error("Couldn't copy — select the text and copy it manually."),
  })

  // Declared before the early return below: hooks must run on every render.
  const pickMood = (m: Mood | null) => {
    setDefaultMood(m)
    setDefaultMoodState(m)
  }
  const moodGroup = useRovingSelection({ values: MOOD_OPTIONS, selected: defaultMood, onSelect: pickMood })

  const LAYOUT_OPTIONS: Array<GroupLayout> = ['list', 'chat']
  const pickLayout = (l: GroupLayout) => {
    setGroupLayout(l)
    setGroupLayoutState(l)
  }
  const layoutGroup = useRovingSelection({ values: LAYOUT_OPTIONS, selected: groupLayout, onSelect: pickLayout })

  if (!user) return null
  const draftName = name ?? user.display_name ?? ''

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = draftName.trim()
    if (!n) return toast.error('A name — even a pen name — is needed.')
    if (n === (user.display_name ?? '')) return
    setSavingName(true)
    try {
      await updateProfile(n)
      await refresh()
      setName(null)
      toast.success("That's the name shared notebooks will use.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.")
    } finally {
      setSavingName(false)
    }
  }

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pw1.length < 8) return toast.error('Passwords need at least 8 characters.')
    if (pw1 !== pw2) return toast.error("The passwords don't match.")
    setSavingPw(true)
    try {
      await updatePassword(pw1)
      setPw1('')
      setPw2('')
      toast.success('Password updated.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the password.")
    } finally {
      setSavingPw(false)
    }
  }

  const backendOk = health.data?.status === 'ok'

  const changePin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\d{4,8}$/.test(newPin)) return toast.error('A PIN is 4 to 8 digits.')
    setSavingPin(true)
    try {
      const { changePin: change } = await import('@/lib/crypto/vault')
      await change(oldPin, newPin)
      setOldPin('')
      setNewPin('')
      toast.success('PIN updated — your entries re-wrapped under the new one.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't change the PIN — check the current PIN.")
    } finally {
      setSavingPin(false)
    }
  }

  const addPasskey = async () => {
    if (!user) return
    setSavingPasskey(true)
    try {
      const { registerPasskey } = await import('@/lib/crypto/passkey')
      await registerPasskey(user)
      setPasskeySet(true)
      toast.success('Passkey added — this browser can unlock without the PIN.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add the passkey.")
    } finally {
      setSavingPasskey(false)
    }
  }

  const dropPasskey = async () => {
    setSavingPasskey(true)
    try {
      const { removePasskey } = await import('@/lib/crypto/passkey')
      await removePasskey()
      setPasskeySet(false)
      toast.success('Passkey removed — the PIN still opens the account everywhere.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove the passkey.")
    } finally {
      setSavingPasskey(false)
    }
  }

  return (
    <div className="mx-4 max-w-2xl lg:mx-0">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-clay">settings</p>
      <h1 className="font-display mt-3 text-3xl leading-tight tracking-tight text-ink">Yours to arrange.</h1>
      <p className="mt-2 text-[13.5px] text-ink-soft">Profile, account, preferences and the app itself.</p>

      <div className="mt-7 space-y-4">
        {/* ------------------------------------------------ profile */}
        <Section title="Profile">
          <form onSubmit={saveName} className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="settings-name" className="text-[12.5px]">
                Display name
              </Label>
              <Input
                id="settings-name"
                value={draftName}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                className="h-10 bg-paper"
                placeholder="Maya Lindqvist"
              />
              <p className="text-[11.5px] text-ink-faint">What shared notebooks call you.</p>
            </div>
            <div>
              <Button type="submit" disabled={savingName} className="press h-9 gap-1.5 shadow-ink">
                {savingName ? (
                  <>
                    <CircleNotch weight="bold" className="h-3.5 w-3.5 animate-spin" /> Saving…
                  </>
                ) : (
                  'Save changes'
                )}
              </Button>
            </div>
          </form>
        </Section>

        {/* ------------------------------------------------ privacy */}
        <Section title="Privacy">
          <PrivacyStatus />
        </Section>

        {/* ------------------------------------------------ install */}
        <InstallAppSection />

        {/* ------------------------------------------------ account */}
        <Section title="Account">
          <Row label="Email">
            <span className="font-mono text-[12px] text-ink-soft">{user.email ?? '—'}</span>
          </Row>
          <Row label="User id">
            <code className="max-w-[16ch] truncate font-mono text-[12px] text-ink-soft">{user.id}</code>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => copy(user.id)}
              aria-label="Copy user id"
              className="press h-8 w-8 shrink-0"
            >
              {copied ? (
                <Check weight="bold" className="h-3.5 w-3.5 text-sage" />
              ) : (
                <Copy weight="regular" className="h-3.5 w-3.5" />
              )}
            </Button>
          </Row>
          <form onSubmit={changePassword} className="mt-2 flex flex-col gap-3 border-t border-line pt-4">
            <p className="text-[13px] font-medium text-ink">Change password</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="settings-pw1" className="text-[12.5px]">
                  New password
                </Label>
                <Input
                  id="settings-pw1"
                  type="password"
                  autoComplete="new-password"
                  value={pw1}
                  onChange={(e) => setPw1(e.target.value)}
                  className="h-10 bg-paper"
                  placeholder="at least 8 characters"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="settings-pw2" className="text-[12.5px]">
                  Repeat it
                </Label>
                <Input
                  id="settings-pw2"
                  type="password"
                  autoComplete="new-password"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  className="h-10 bg-paper"
                  placeholder="same as above"
                />
              </div>
            </div>
            <div>
              <Button
                type="submit"
                variant="outline"
                disabled={savingPw}
                className="press h-9 gap-1.5 border-line bg-paper"
              >
                {savingPw ? (
                  <>
                    <CircleNotch weight="bold" className="h-3.5 w-3.5 animate-spin" /> Updating…
                  </>
                ) : (
                  'Update password'
                )}
              </Button>
            </div>
          </form>
          <div className="mt-2 border-t border-line pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => logout()}
              className="press h-9 gap-1.5 text-ember hover:text-ember"
            >
              Sign out of this device
            </Button>
          </div>
        </Section>

        {/* ------------------------------------------------ encryption PIN */}
        <Section title="Encryption PIN">
          <p className="text-[13px] font-medium text-ink">This PIN unlocks your journal on every device</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ink-faint">
            Your entries are sealed in the browser before they are stored; the key opens only with this PIN. Signing in
            somewhere new asks for it — that is what lets a second device read everything the first one wrote. There is
            no recovery path: forget it and the entries stay sealed forever, even from us.
          </p>
          <form onSubmit={changePin} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
            <p className="text-[13px] font-medium text-ink">Change PIN</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="settings-old-pin" className="text-[12.5px]">
                  Current PIN
                </Label>
                <Input
                  id="settings-old-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={oldPin}
                  onChange={(e) => setOldPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  className="h-10 bg-paper"
                  placeholder="required to change"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="settings-new-pin" className="text-[12.5px]">
                  New PIN
                </Label>
                <Input
                  id="settings-new-pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  className="h-10 bg-paper"
                  placeholder="4 to 8 digits"
                  required
                />
              </div>
            </div>
            <div>
              <Button
                type="submit"
                variant="outline"
                disabled={savingPin}
                className="press h-9 gap-1.5 border-line bg-paper"
              >
                {savingPin ? (
                  <>
                    <CircleNotch weight="bold" className="h-3.5 w-3.5 animate-spin" /> Re-wrapping…
                  </>
                ) : (
                  'Update PIN'
                )}
              </Button>
            </div>
          </form>
          <div className="mt-2 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={() => lockVault()} className="press h-9 gap-1.5">
              Lock the journal now
            </Button>
          </div>
        </Section>

        {/* ------------------------------------------------ passkey */}
        <Section title="Passkey">
          <p className="text-[13px] font-medium text-ink">Unlock this browser without typing the PIN</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ink-faint">
            A passkey is bound to this browser only — lose it and nothing happens, the PIN still opens the account
            everywhere. It never replaces the PIN, it just skips typing it here.
          </p>
          <div className="mt-4 border-t border-line pt-4">
            {passkeySet ? (
              <Button
                type="button"
                variant="outline"
                disabled={savingPasskey}
                onClick={() => void dropPasskey()}
                className="press h-9 gap-1.5 border-line bg-paper"
              >
                {savingPasskey ? (
                  <>
                    <CircleNotch weight="bold" className="h-3.5 w-3.5 animate-spin" /> Removing…
                  </>
                ) : (
                  'Remove this passkey'
                )}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={savingPasskey}
                onClick={() => void addPasskey()}
                className="press h-9 gap-1.5 border-line bg-paper"
              >
                {savingPasskey ? (
                  <>
                    <CircleNotch weight="bold" className="h-3.5 w-3.5 animate-spin" /> Waiting for your passkey…
                  </>
                ) : (
                  'Add a passkey on this browser'
                )}
              </Button>
            )}
          </div>
        </Section>

        {/* ------------------------------------------------ preferences */}
        <Section title="Preferences">
          <p className="text-[13px] font-medium text-ink">Default mood for new entries</p>
          <p className="mt-1 text-[11.5px] text-ink-faint">Pre-selected when you compose. Kept on this device only.</p>
          <div
            className="mt-3 flex flex-wrap gap-2"
            role="radiogroup"
            aria-label="Default mood"
            onKeyDown={moodGroup.onKeyDown}
          >
            <button
              ref={moodGroup.registerItem(null)}
              type="button"
              role="radio"
              aria-checked={defaultMood === null}
              tabIndex={moodGroup.tabIndexFor(null)}
              onClick={() => pickMood(null)}
              className={`press rounded-full border px-3.5 py-1.5 font-mono text-[11px] ${
                defaultMood === null
                  ? 'border-clay-soft bg-clay-tint text-clay-ink'
                  : 'border-line bg-paper text-ink-faint hover:text-ink'
              }`}
            >
              none
            </button>
            {MOODS.map((m, i) => (
              <button
                key={m}
                ref={moodGroup.registerItem(m)}
                type="button"
                role="radio"
                aria-checked={defaultMood === m}
                tabIndex={moodGroup.tabIndexFor(m)}
                onClick={() => pickMood(m)}
                title={MOOD_META[m].label}
                className={`press inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] ${
                  defaultMood === m
                    ? 'border-clay-soft bg-clay-tint text-clay-ink'
                    : 'border-line bg-paper text-ink-soft hover:text-ink'
                }`}
              >
                <MoodGlyph mood={m} className="h-3.5 w-3.5" />
                {MOOD_META[m].label}
              </button>
            ))}
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <p className="text-[13px] font-medium text-ink">Group journal layout</p>
            <p className="mt-1 text-[11.5px] text-ink-faint">
              How shared entries are shown in a group. Kept on this device only.
            </p>
            <div
              className="mt-3 flex flex-wrap gap-2"
              role="radiogroup"
              aria-label="Group journal layout"
              onKeyDown={layoutGroup.onKeyDown}
            >
              <button
                ref={layoutGroup.registerItem('list')}
                type="button"
                role="radio"
                aria-checked={groupLayout === 'list'}
                tabIndex={layoutGroup.tabIndexFor('list')}
                onClick={() => pickLayout('list')}
                className={`press rounded-full border px-3.5 py-1.5 font-mono text-[11px] ${
                  groupLayout === 'list'
                    ? 'border-clay-soft bg-clay-tint text-clay-ink'
                    : 'border-line bg-paper text-ink-faint hover:text-ink'
                }`}
              >
                list
              </button>
              <button
                ref={layoutGroup.registerItem('chat')}
                type="button"
                role="radio"
                aria-checked={groupLayout === 'chat'}
                tabIndex={layoutGroup.tabIndexFor('chat')}
                onClick={() => pickLayout('chat')}
                className={`press rounded-full border px-3.5 py-1.5 font-mono text-[11px] ${
                  groupLayout === 'chat'
                    ? 'border-clay-soft bg-clay-tint text-clay-ink'
                    : 'border-line bg-paper text-ink-faint hover:text-ink'
                }`}
              >
                chatroom
              </button>
            </div>
          </div>
        </Section>

        {/* ------------------------------------------------ app */}
        <Section title="App">
          <SyncStatus />
          <Row label="Backend">
            <span
              role="status"
              aria-live="polite"
              className={`inline-flex items-center gap-1.5 font-mono text-[12px] ${backendOk ? 'text-sage' : 'text-ember'}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${backendOk ? 'bg-sage' : 'bg-ember'}`} aria-hidden />
              {/* A failed request used to render 'checking...' forever. */}
              {health.isError
                ? 'unreachable'
                : health.data
                  ? backendOk
                    ? `connected · v${health.data.version}`
                    : 'unreachable'
                  : 'checking...'}
            </span>
          </Row>
          <Row label="Legal">
            <span className="flex items-center gap-3 font-mono text-[12px]">
              <Link
                href="/privacy"
                className="inline-flex items-center gap-1 text-clay-ink underline underline-offset-2"
              >
                Privacy <ArrowSquareOut className="h-3 w-3" />
              </Link>
              <Link href="/terms" className="inline-flex items-center gap-1 text-clay-ink underline underline-offset-2">
                Terms <ArrowSquareOut className="h-3 w-3" />
              </Link>
            </span>
          </Row>
        </Section>
      </div>
    </div>
  )
}
