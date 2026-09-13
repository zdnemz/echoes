'use client'

/**
 * The invite accept flow (PRD §6.6):
 *   token → public invite info → signed in? join : send them to the auth
 *   panel with the invite stashed (auto-joins after sign-in/sign-up).
 * Every state — pending, accepted, expired, revoked, unknown, wrong email,
 * backend not wired — gets its own composed screen, never a dead end.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CircleNotch, EnvelopeSimple, UsersThree } from '@phosphor-icons/react/dist/ssr'
import { Button } from '@/components/ui/button'
import { Grain } from '@/components/grain'
import { Wordmark } from '@/components/brand'
import { UnconfiguredNotice } from '@/components/unconfigured'
import { useSession } from '@/lib/auth/session'
import { useAcceptInvite, useInviteInfo } from '@/lib/api/hooks'
import { isUnconfigured } from '@/lib/api/client'
import { stashPendingInvite } from '@/lib/auth/invite-stash'
import { formatDay } from '@/lib/format'

type Outcome = 'idle' | 'joined'

export function InviteAccept({ token }: { token: string | null }) {
  const router = useRouter()
  const { status: sessionStatus, user } = useSession()
  const info = useInviteInfo(token)
  const accept = useAcceptInvite()
  const [outcome, setOutcome] = useState<Outcome>('idle')
  const [error, setError] = useState<string | null>(null)
  const [unconfigured, setUnconfigured] = useState(false)

  // Signed-in user whose email matches → offer immediate join.
  // Otherwise stash the invite and route to the auth panel.
  const emailMatches =
    user?.email && info.data?.invited_email ? user.email.toLowerCase() === info.data.invited_email.toLowerCase() : false

  useEffect(() => {
    if (info.data?.status === 'pending') {
      stashPendingInvite({ token: info.data.token, invited_email: info.data.invited_email })
    }
  }, [info.data])

  const join = async () => {
    if (!token) return
    setError(null)
    try {
      const result = await accept.mutateAsync(token)
      setOutcome('joined')
      toast.success(result.message)
    } catch (err) {
      if (isUnconfigured(err)) setUnconfigured(true)
      else setError(err instanceof Error ? err.message : "Couldn't join.")
    }
  }

  const toAuth = () => {
    router.push('/register')
  }

  // --------------------------------------------------------------- frames

  const frame = (children: React.ReactNode) => (
    <div className="relative flex min-h-[100dvh] flex-col bg-paper text-ink">
      <Grain />
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-4 sm:px-6">
          <Link href="/" aria-label="Echoes — home">
            <Wordmark className="text-lg" />
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-14 sm:px-6">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto max-w-5xl px-4 py-4 font-mono text-[10.5px] text-ink-faint sm:px-6">
          the link is the invite — single-use, expiring
        </div>
      </footer>
    </div>
  )

  // --------------------------------------------------------------- states

  if (!token) {
    return frame(
      <div>
        <h1 className="font-display text-3xl text-ink">Half a link, somehow.</h1>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-soft">
          This page needs an invite token — the part after{' '}
          <code className="rounded bg-paper-deep px-1.5 py-0.5 font-mono text-[11px]">?token=</code>. Ask for the link
          again.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block font-mono text-[11px] uppercase tracking-[0.16em] text-clay-ink underline underline-offset-4"
        >
          back to echoes
        </Link>
      </div>,
    )
  }

  if (info.isLoading) {
    return frame(
      <div className="flex items-center gap-3 text-ink-soft">
        <CircleNotch weight="bold" className="h-4 w-4 animate-spin text-clay" />
        <span className="font-mono text-[12px]">checking the invite…</span>
      </div>,
    )
  }

  if (unconfigured) {
    return frame(
      <div>
        <h1 className="font-display text-3xl text-ink">The invite is real.</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
          The backend just isn&apos;t wired on this deployment yet.
        </p>
        <div className="mt-5">
          <UnconfiguredNotice />
        </div>
      </div>,
    )
  }

  if (info.isError) {
    if (isUnconfigured(info.error)) {
      return frame(
        <div>
          <h1 className="font-display text-3xl text-ink">The invite is real.</h1>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
            The backend just isn&apos;t wired on this deployment yet.
          </p>
          <div className="mt-5">
            <UnconfiguredNotice />
          </div>
        </div>,
      )
    }
    return frame(
      <div>
        <h1 className="font-display text-3xl text-ink">The invite can&apos;t be checked.</h1>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-soft">
          {info.error instanceof Error ? info.error.message : 'Something went sideways.'} Try the link again in a
          moment.
        </p>
      </div>,
    )
  }

  const data = info.data!

  // Already accepted / already member — straight into the journal.
  if (outcome === 'joined' || data.status === 'accepted' || data.already_member) {
    return frame(
      <div>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sage-tint">
          <UsersThree weight="fill" className="h-6 w-6 text-sage" />
        </div>
        <h1 className="font-display mt-6 text-3xl text-ink">{data.group_name} has you.</h1>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-soft">
          Shared notebooks from this circle appear in your rail — refreshed every time you open them.
        </p>
        <Button asChild className="press mt-7 h-11 shadow-ink" size="lg">
          <Link href="/journal">Open your journal</Link>
        </Button>
      </div>,
    )
  }

  if (data.status === 'expired') {
    return frame(
      <div>
        <h1 className="font-display text-3xl text-ink">This invite ran out of time.</h1>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-soft">
          Invites expire on their own — this one for{' '}
          <span className="font-mono text-[12.5px]">{data.invited_email}</span> to {data.group_name} is past its{' '}
          {data.expires_at ? formatDay(data.expires_at) : 'deadline'}. Ask the group owner for a fresh link.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block font-mono text-[11px] uppercase tracking-[0.16em] text-clay-ink underline underline-offset-4"
        >
          back to echoes
        </Link>
      </div>,
    )
  }

  if (data.status === 'revoked' || data.status === 'unknown_email') {
    return frame(
      <div>
        <h1 className="font-display text-3xl text-ink">This link no longer works.</h1>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-soft">
          It was revoked, or it never was a real invite. The group owner can send a new one — they&apos;re single-use by
          design.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block font-mono text-[11px] uppercase tracking-[0.16em] text-clay-ink underline underline-offset-4"
        >
          back to echoes
        </Link>
      </div>,
    )
  }

  // pending + signed in + matching email → join now
  if (sessionStatus === 'authenticated' && user?.email) {
    if (emailMatches) {
      return frame(
        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-clay">invite</p>
          <h1 className="font-display mt-4 text-3xl leading-tight text-ink">
            You&apos;re invited to {data.group_name}.
          </h1>
          <p className="mt-4 text-[14px] leading-relaxed text-ink-soft">
            One click and the circle&apos;s shared notebooks — and their entries — are in your journal.
          </p>
          {error && <p className="mt-4 text-[12.5px] text-ember">{error}</p>}
          <Button onClick={join} disabled={accept.isPending} className="press mt-7 h-11 gap-2 shadow-ink" size="lg">
            {accept.isPending ? (
              <>
                <CircleNotch weight="bold" className="h-4 w-4 animate-spin" /> Joining…
              </>
            ) : (
              'Join ' + data.group_name
            )}
          </Button>
        </div>,
      )
    }

    // signed in as someone else
    return frame(
      <div>
        <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-clay">invite</p>
        <h1 className="font-display mt-4 text-3xl leading-tight text-ink">This invite is addressed to someone else.</h1>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-soft">
          It belongs to <span className="font-mono text-[12.5px]">{data.invited_email}</span>, and you&apos;re signed in
          as <span className="font-mono text-[12.5px]">{user.email}</span>. Sign out and back in with the invited
          address — or ask the owner for one addressed to you.
        </p>
        <div className="mt-7 flex gap-3">
          <Button asChild variant="outline" className="press h-11 border-line bg-paper-raised" size="lg">
            <Link href="/journal">Keep my account</Link>
          </Button>
        </div>
      </div>,
    )
  }

  // pending + anonymous → stash + auth (generic restoring state included)
  return frame(
    <div>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-clay-tint">
        <EnvelopeSimple weight="regular" className="h-6 w-6 text-clay" />
      </div>
      <p className="mt-6 font-mono text-[10.5px] uppercase tracking-[0.2em] text-clay">invite</p>
      <h1 className="font-display mt-3 text-3xl leading-tight text-ink">You&apos;re invited to {data.group_name}.</h1>
      <p className="mt-4 text-[14px] leading-relaxed text-ink-soft">
        The invite is addressed to <span className="font-mono text-[12.5px]">{data.invited_email}</span>. Create an
        account with that address (or sign in), and you&apos;ll join the group automatically — the invite is already
        waiting.
      </p>
      <Button asChild onClick={toAuth} className="press mt-7 h-11 shadow-ink" size="lg">
        <Link href="/register">Sign in or create the account</Link>
      </Button>
      <p className="mt-5 font-mono text-[10.5px] text-ink-faint">
        {data.expires_at ? `valid until ${formatDay(data.expires_at)}` : 'single-use link'}
      </p>
    </div>,
  )
}
