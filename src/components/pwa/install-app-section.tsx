'use client'

/**
 * "Install Echoes" — surfaced in Settings. Deliberately quiet: a native install
 * prompt is intrusive, so the app never begs; it just offers itself here and
 * lets the browser handle the actual dialog.
 */
import { useState } from 'react'
import { toast } from 'sonner'
import { Check, DownloadSimple, ShareNetwork } from '@phosphor-icons/react/dist/ssr'
import { Button } from '@/components/ui/button'
import { useInstallPrompt } from '@/lib/pwa/use-install-prompt'

export function InstallAppSection() {
  const { canPrompt, ios, installed, prompted, promptInstall } = useInstallPrompt()
  const [busy, setBusy] = useState(false)

  // Already on the home screen — the whole section is noise here.
  if (installed) return null

  const install = async () => {
    setBusy(true)
    try {
      const outcome = await promptInstall()
      if (outcome === 'accepted') toast.success('Echoes is on your home screen.')
      // 'dismissed' and 'unavailable' need no toast — the user already knows.
    } catch {
      toast.error("Couldn't start installation — try Add to Home Screen from your browser menu.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-xl border border-line bg-paper-raised p-5 sm:p-6">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.18em] text-clay">Install</h2>
      <div className="mt-4">
        <p className="text-[13px] leading-relaxed text-ink-soft">
          Keep Echoes on your home screen — opens full-screen, no browser chrome, and your queued offline entries sync
          the moment you&rsquo;re back online.
        </p>

        {canPrompt ? (
          <div className="mt-4">
            <Button onClick={install} disabled={busy} className="press h-9 gap-1.5 shadow-ink">
              {busy ? (
                <>
                  <DownloadSimple weight="bold" className="h-3.5 w-3.5 animate-bounce" /> Waiting…
                </>
              ) : prompted ? (
                <>
                  <Check weight="bold" className="h-3.5 w-3.5" /> Install again
                </>
              ) : (
                <>
                  <DownloadSimple weight="bold" className="h-3.5 w-3.5" /> Install Echoes
                </>
              )}
            </Button>
          </div>
        ) : ios ? (
          // iOS Safari can't be programmatically prompted; walk the user there.
          <div className="mt-4 rounded-lg border border-line bg-paper p-4">
            <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
              <ShareNetwork weight="bold" className="h-4 w-4 text-clay" /> In Safari, tap the Share button
            </p>
            <ol className="mt-2 space-y-1.5 pl-4 text-[12px] leading-relaxed text-ink-soft">
              <li>1. Tap the Share icon in the toolbar.</li>
              <li>
                2. Choose <span className="font-medium text-ink">Add to Home Screen</span>.
              </li>
              <li>
                3. Tap <span className="font-medium text-ink">Add</span>.
              </li>
            </ol>
          </div>
        ) : (
          <p className="mt-3 text-[11.5px] leading-relaxed text-ink-faint">
            Install this app from your browser&rsquo;s menu — look for{' '}
            <span className="font-medium text-ink-soft">Install Echoes</span> or{' '}
            <span className="font-medium text-ink-soft">Add to Home Screen</span>.
          </p>
        )}
      </div>
    </section>
  )
}
