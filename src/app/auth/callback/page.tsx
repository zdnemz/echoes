'use client'

/**
 * The OAuth landing page — Supabase redirects here after the Google
 * round-trip, appending ?code=… (or ?error=… when consent was declined or
 * something upstream failed).
 *
 * The code is exchanged through /api/auth/oauth/callback (the server holds
 * the anon key), the resulting session is adopted, a stashed invite is
 * consumed, and the writer lands in their journal. Query params are read in
 * an effect (never during render) so the page prerenders as a neutral shell
 * — no hydration surface.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Grain } from '@/components/grain'
import { Wordmark } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { ArrowLeft, CircleNotch } from '@phosphor-icons/react/dist/ssr'
import { exchangeCallbackCode } from '@/lib/auth/oauth'
import { adoptSession } from '@/lib/auth/session'
import { clearPendingInvite, popPendingInvite } from '@/lib/auth/invite-stash'
import { isUnconfigured } from '@/lib/api/client'
import { UnconfiguredNotice } from '@/components/unconfigured'

type Phase = 'reading' | 'exchanging' | 'failed' | 'unconfigured' | 'noop'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('reading')
  const [message, setMessage] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return // strict-mode double-invoke guard
    started.current = true

    const run = async () => {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const error = params.get('error')
      const errorDescription = params.get('error_description')

      // No code and no error — someone opened the URL directly. Nothing to do.
      if (!code && !error) {
        setPhase('noop')
        return
      }

      if (error) {
        setPhase('failed')
        setMessage(
          errorDescription ??
            (error === 'access_denied' ? 'You cancelled the Google sign-in.' : 'Google sign-in failed.'),
        )
        return
      }

      setPhase('exchanging')
      try {
        const session = await exchangeCallbackCode(code!)
        adoptSession(session)

        // Same post-sign-in courtesy as the auth panel: a stashed invite
        // link sends the fresh session back to the accept page.
        const stashed = popPendingInvite()
        if (stashed) {
          clearPendingInvite()
          router.replace(`/invites/accept?token=${encodeURIComponent(stashed.token)}`)
          return
        }
        router.replace('/journal')
      } catch (err) {
        if (isUnconfigured(err)) {
          setPhase('unconfigured')
          return
        }
        setPhase('failed')
        setMessage(err instanceof Error && err.message ? err.message : 'The sign-in could not be completed.')
      }
    }
    void run()
  }, [router])

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-paper text-ink">
      <Grain />
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          <div className="rounded-xl border border-line bg-paper-raised p-8 shadow-lift">
            <Wordmark className="text-lg" />

            {phase === 'reading' || phase === 'exchanging' ? (
              <div className="mt-6 flex items-center gap-3" role="status">
                <CircleNotch weight="bold" className="h-4 w-4 animate-spin text-clay" />
                <p className="text-[13.5px] text-ink-soft">Finishing the sign-in…</p>
              </div>
            ) : phase === 'unconfigured' ? (
              <div className="mt-6">
                <p className="text-[13.5px] text-ink-soft">Almost there — this deployment needs its backend keys.</p>
                <div className="mt-4">
                  <UnconfiguredNotice />
                </div>
              </div>
            ) : phase === 'noop' ? (
              <div className="mt-6">
                <p className="text-[13.5px] leading-relaxed text-ink-soft">
                  This page completes a Google sign-in. If you were looking to start one, begin from the sign-in page.
                </p>
                <Button asChild variant="outline" className="press mt-5 h-10 gap-2">
                  <Link href="/login">
                    <ArrowLeft weight="bold" className="h-4 w-4" /> Back to sign in
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="mt-6">
                <p className="font-display text-lg text-ink">That didn’t land.</p>
                <p className="mt-2 text-[13px] leading-relaxed text-ember">
                  {message ?? 'The sign-in could not be completed.'}
                </p>
                <p className="mt-3 text-[12.5px] leading-relaxed text-ink-faint">
                  One-time codes expire quickly — starting again usually fixes it.
                </p>
                <Button asChild variant="outline" className="press mt-5 h-10 gap-2">
                  <Link href="/login">
                    <ArrowLeft weight="bold" className="h-4 w-4" /> Try again
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
