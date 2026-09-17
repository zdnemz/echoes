'use client'

/**
 * First-run name gate — every new account passes through here before the
 * journal. No skip: shared notebooks address members by display name, so
 * an account without one is an unfinished account. Existing named accounts
 * that land here directly are forwarded on.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CircleNotch } from '@phosphor-icons/react/dist/ssr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Wordmark } from '@/components/brand'
import { useSession } from '@/lib/auth/session'
import { updateProfile } from '@/lib/api/endpoints'
import { clearPendingInvite, popPendingInvite } from '@/lib/auth/invite-stash'
import Link from 'next/link'

export function WelcomeName() {
  const router = useRouter()
  const { status, user, logout, refresh } = useSession()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const forwarded = useRef(false)

  const forward = useCallback(() => {
    if (forwarded.current) return
    forwarded.current = true
    const stashed = popPendingInvite()
    if (stashed) {
      clearPendingInvite()
      router.replace(`/invites/accept?token=${encodeURIComponent(stashed.token)}`)
    } else {
      router.replace('/journal')
    }
  }, [router])

  // Anonymous → sign in. Named → nothing to do here.
  useEffect(() => {
    if (status === 'anonymous') router.replace('/login')
    else if (status === 'authenticated' && (user?.display_name ?? '').trim()) forward()
  }, [status, user, router, forward])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return toast.error('A name — even a pen name — is needed.')
    if (n.length > 80) return toast.error('Keep it under 80 characters.')
    setBusy(true)
    try {
      await updateProfile(n)
      await refresh()
      toast.success(`Welcome, ${n}.`)
      forward()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-background font-mono text-foreground">
      <header className="border-b-[3px] border-foreground">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-4 sm:px-6">
          <Link href="/" aria-label="Echoes — home">
            <Wordmark className="text-lg" />
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-14 sm:px-6">
        {status !== 'authenticated' ? (
          <div className="flex items-center gap-3" role="status">
            <CircleNotch weight="bold" className="h-4 w-4 animate-spin text-accent" />
            <span className="font-mono text-[12px] font-bold">getting your account ready…</span>
          </div>
        ) : (
          <div className="border-2 border-foreground bg-background p-6 shadow-brutal sm:p-8">
            <p className="inline-block border-2 border-foreground bg-foreground px-2 py-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.2em] text-background">
              one last thing
            </p>
            <h1 className="font-display mt-4 text-3xl uppercase">What should we call you?</h1>
            <p className="mt-4 border-l-4 border-accent pl-4 text-[14px] font-bold leading-relaxed">
              Shared notebooks address you by name
              {user?.email ? (
                <>
                  {' '}
                  — <span className="bg-muted px-1.5 py-0.5 font-mono text-[12.5px]">{user.email}</span> stays private
                </>
              ) : (
                ''
              )}
              . A pen name works perfectly well.
            </p>
            <form onSubmit={submit} noValidate className="mt-7 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="welcome-name">Display name</Label>
                <Input
                  id="welcome-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Maya Lindqvist"
                  autoFocus
                  autoComplete="name"
                  maxLength={80}
                  className="h-11 text-[15px]"
                />
              </div>
              <Button type="submit" disabled={busy} size="lg" className="h-11 gap-2">
                {busy ? (
                  <>
                    <CircleNotch weight="bold" className="h-4 w-4 animate-spin" /> Saving…
                  </>
                ) : (
                  'Start writing'
                )}
              </Button>
            </form>
            <button
              type="button"
              onClick={() => logout()}
              className="press mt-5 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] underline underline-offset-4 hover:text-accent"
            >
              use a different account
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
