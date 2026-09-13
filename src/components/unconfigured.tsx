'use client'

/**
 * The calm state shown wherever the API answers 503 SUPABASE_NOT_CONFIGURED.
 * Instead of a wall of error toasts: one quiet card.
 *
 * End users (production) get a plain "try again later" message — the wiring
 * checklist below is a developer surface and only renders in development.
 */

import Link from 'next/link'
import { PlugsConnected } from '@phosphor-icons/react/dist/ssr'

export function UnconfiguredNotice({ compact = false }: { compact?: boolean }) {
  // Developer checklist — never shown to end users in production.
  // (String() keeps this a runtime check; the build inlines NODE_ENV.)
  if (String(process.env.NODE_ENV) === 'production') {
    return (
      <div role="status" className="rounded-lg border border-line bg-paper-deep px-5 py-4 text-ink">
        <p className="text-[13.5px] font-medium">The journal is temporarily unavailable</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
          We couldn&apos;t reach your notebooks just now. Please try again in a bit — nothing you wrote is lost.
        </p>
      </div>
    )
  }

  return (
    <div role="status" className="rounded-lg border border-clay-soft/60 bg-clay-tint/70 px-5 py-4 text-ink">
      <div className="flex items-center gap-2.5">
        <PlugsConnected weight="duotone" className="h-4.5 w-4.5 shrink-0 text-clay" />
        <p className="text-[13.5px] font-medium">The journal backend isn&apos;t wired up yet</p>
      </div>
      {!compact && (
        <>
          <p className="mt-2.5 max-w-[58ch] text-[12.5px] leading-relaxed text-ink-soft">
            This deployment has no Supabase keys, so accounts and notebooks can&apos;t be reached right now. Everything
            else is live — the interface will pick the data layer up the moment it appears.
          </p>
          <ol className="mt-3.5 space-y-1.5 border-t border-clay-soft/40 pt-3.5 font-mono text-[11px] leading-relaxed text-ink-soft">
            <li>1 · apply supabase/migrations/0001_init.sql to the project</li>
            <li>2 · set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in .env</li>
            <li>
              3 · reload — status lives on the{' '}
              {process.env.NODE_ENV === 'production' ? (
                <span className="text-clay-ink">/api/health endpoint</span>
              ) : (
                <Link href="/console" className="text-clay-ink underline underline-offset-2">
                  console
                </Link>
              )}
            </li>
          </ol>
        </>
      )}
    </div>
  )
}
