'use client'

/**
 * The invite-link accept flow:
 *   token → public link info → signed in? join/request : stash the token
 *   and send them to auth (the accept page finishes after sign-in).
 * Every state — usable, expired, revoked, requested, joined, backend not
 * wired — gets its own composed screen, never a dead end.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CircleNotch, LinkSimple } from '@phosphor-icons/react/dist/ssr'
import { Button } from '@/components/ui/button'
import { Grain } from '@/components/grain'
import { Wordmark } from '@/components/brand'
import { UnconfiguredNotice } from '@/components/unconfigured'
import { useSession } from '@/lib/auth/session'
import { useJoinViaLink, useLinkInfo } from '@/lib/api/hooks'
import { isUnconfigured } from '@/lib/api/client'
import { stashPendingInvite } from '@/lib/auth/invite-stash'
import { formatDay } from '@/lib/format'
import type { JoinResult } from '@/lib/api/types'

export function InviteAccept({ token }: { token: string | null }) {
  const router = useRouter()
  const { status: sessionStatus } = useSession()
  const info = useLinkInfo(token)
  const join = useJoinViaLink()
  const [outcome, setOutcome] = useState<JoinResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [unconfigured, setUnconfigured] = useState(false)
  const redirected = useRef(false)

  // Members don't need the link — and dead links aren't destinations.
  // Signed-in visitors go straight to the dashboard with an explanation;
  // anonymous ones keep the explanatory screens below (they have nowhere
  // to be sent yet).
  const leave = (message: string) => {
    if (redirected.current) return
    redirected.current = true
    toast.info(message)
    router.replace('/journal')
  }

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || !token || redirected.current) return
    if (info.data && !info.data.usable) {
      const expired = info.data.expires_at && new Date(info.data.expires_at).getTime() < Date.now()
      leave(expired ? 'That invite link expired — ask the owner for a fresh one.' : 'That invite link no longer works.')
    } else if (info.isError && !isUnconfigured(info.error)) {
      leave('That invite link no longer works.')
    }
  }, [info.data, info.isError, info.error, sessionStatus, token, router])

  // Stash usable links so anonymous visitors land back here after auth.
  useEffect(() => {
    if (info.data?.usable && info.data.token) {
      stashPendingInvite({ token: info.data.token })
    }
  }, [info.data])

  const act = async () => {
    if (!token) return
    setError(null)
    try {
      const result = await join.mutateAsync(token)
      if (result.status === 'joined' || result.status === 'member') {
        // In — no interstitial. Already-members land here when they open
        // a link they previously used: the invitation is spent.
        if (redirected.current) return
        redirected.current = true
        toast.success(result.message)
        router.replace('/journal')
        return
      }
      setOutcome(result)
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
          the link is the invite — the owner can revoke it any time
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
        <span className="font-mono text-[12px]">checking the link…</span>
      </div>,
    )
  }

  if (unconfigured) {
    return frame(
      <div>
        <h1 className="font-display text-3xl text-ink">The link is real.</h1>
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
          <h1 className="font-display text-3xl text-ink">The link is real.</h1>
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
        <h1 className="font-display text-3xl text-ink">This link no longer works.</h1>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-soft">
          It was revoked, or it never was a real invite link. The group owner can share a fresh one.
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

  const data = info.data!

  // Awaiting approval — the one state worth lingering on.
  if (outcome?.status === 'requested' || outcome?.status === 'pending') {
    return frame(
      <div>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-clay-tint">
          <LinkSimple weight="bold" className="h-6 w-6 text-clay" />
        </div>
        <h1 className="font-display mt-6 text-3xl text-ink">Request sent.</h1>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-soft">
          The owner of {data.group_name} approves new members — you&apos;ll see the group in your rail once they do.
        </p>
        <Button asChild variant="outline" className="press mt-7 h-11 border-line bg-paper-raised" size="lg">
          <Link href="/journal">Back to your journal</Link>
        </Button>
      </div>,
    )
  }

  if (!data.usable) {
    const expired = data.expires_at && new Date(data.expires_at).getTime() < Date.now()
    return frame(
      <div>
        <h1 className="font-display text-3xl text-ink">
          {expired ? 'This link ran out of time.' : 'This link no longer works.'}
        </h1>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-soft">
          {expired ? (
            <>
              Links can expire on their own — this one for {data.group_name} is past its{' '}
              {data.expires_at ? formatDay(data.expires_at) : 'deadline'}. Ask the group owner for a fresh link.
            </>
          ) : (
            <>It was revoked, or it never was a real invite link. The group owner can share a fresh one.</>
          )}
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

  // usable + signed in → join or request, one click
  if (sessionStatus === 'authenticated') {
    return frame(
      <div>
        <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-clay">invite</p>
        <h1 className="font-display mt-4 text-3xl leading-tight text-ink">You&apos;re invited to {data.group_name}.</h1>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-soft">
          {data.auto_accept ? (
            <>One click and the circle&apos;s shared notebooks — and their entries — are in your journal.</>
          ) : (
            <>This circle approves new members. Send a request and the owner will let you in — usually quickly.</>
          )}
        </p>
        {error && <p className="mt-4 text-[12.5px] text-ember">{error}</p>}
        <Button onClick={act} disabled={join.isPending} className="press mt-7 h-11 gap-2 shadow-ink" size="lg">
          {join.isPending ? (
            <>
              <CircleNotch weight="bold" className="h-4 w-4 animate-spin" />{' '}
              {data.auto_accept ? 'Joining…' : 'Sending…'}
            </>
          ) : data.auto_accept ? (
            'Join ' + data.group_name
          ) : (
            'Request to join'
          )}
        </Button>
        {data.expires_at && (
          <p className="mt-5 font-mono text-[10.5px] text-ink-faint">link valid until {formatDay(data.expires_at)}</p>
        )}
      </div>,
    )
  }

  // usable + anonymous → stash + auth (generic restoring state included)
  return frame(
    <div>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-clay-tint">
        <LinkSimple weight="bold" className="h-6 w-6 text-clay" />
      </div>
      <p className="mt-6 font-mono text-[10.5px] uppercase tracking-[0.2em] text-clay">invite</p>
      <h1 className="font-display mt-3 text-3xl leading-tight text-ink">You&apos;re invited to {data.group_name}.</h1>
      <p className="mt-4 text-[14px] leading-relaxed text-ink-soft">
        {data.auto_accept ? (
          <>Create an account (or sign in) and you&apos;ll join the group on the spot — the link is already waiting.</>
        ) : (
          <>
            Create an account (or sign in) and you can request to join — the owner approves new members for this circle.
          </>
        )}
      </p>
      <Button asChild onClick={toAuth} className="press mt-7 h-11 shadow-ink" size="lg">
        <Link href="/register">Sign in or create the account</Link>
      </Button>
      <p className="mt-5 font-mono text-[10.5px] text-ink-faint">
        {data.expires_at ? `link valid until ${formatDay(data.expires_at)}` : 'no expiry on this link'}
      </p>
    </div>,
  )
}
