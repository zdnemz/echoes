'use client'

import { useEffect, useState } from 'react'

/**
 * Install affordance for PWA "Add to Home Screen".
 *
 * Three browser behaviors, one surface:
 *  - Chromium/Android fire `beforeinstallprompt`, which we hold onto and hand
 *    back to `prompt()` — the only sanctioned way to trigger installation.
 *  - iOS Safari never fires it; installation is Share → Add to Home Screen,
 *    so we expose `ios` to render instructions instead of a dead button.
 *  - Already installed (standalone display mode) — the whole thing hides.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // iOS uses a non-standard boolean; others honor the media query.
  return (
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}

function isIosSafari(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent
  const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && 'ontouchend' in document)
  // Chrome/Firefox on iOS are WebKit but don't support Add to Home Screen the
  // same way; the instruction sheet targets Safari specifically.
  return isIos && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua)
}

export interface InstallState {
  /** A native install prompt is queued and `promptInstall()` will work. */
  canPrompt: boolean
  /** Running in iOS Safari — show the manual instructions instead. */
  ios: boolean
  /** Already launched from the home screen; nothing to install. */
  installed: boolean
}

export function useInstallPrompt() {
  const [state, setState] = useState<InstallState>(() => ({
    canPrompt: false,
    ios: isIosSafari(),
    installed: isStandalone(),
  }))
  const [prompted, setPrompted] = useState(false)
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (isStandalone()) return // nothing to do; state already reflects it

    const onBeforeInstall = (e: Event) => {
      // The browser would otherwise show its own minimal prompt; we suppress
      // it here so the only affordance is ours, in settings.
      e.preventDefault()
      setEvent(e as BeforeInstallPromptEvent)
      setState((s) => ({ ...s, canPrompt: true, installed: false }))
    }
    const onInstalled = () => {
      setEvent(null)
      setPrompted(false)
      setState((s) => ({ ...s, canPrompt: false, installed: true }))
    }
    const onDisplayChange = () =>
      setState((s) => ({ ...s, installed: isStandalone(), canPrompt: isStandalone() ? false : s.canPrompt }))

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    const mq = window.matchMedia('(display-mode: standalone)')
    mq.addEventListener('change', onDisplayChange)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
      mq.removeEventListener('change', onDisplayChange)
    }
  }, [])

  const promptInstall = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!event) return 'unavailable'
    await event.prompt()
    const { outcome } = await event.userChoice
    setEvent(null)
    setPrompted(true)
    setState((s) => ({ ...s, canPrompt: false }))
    return outcome
  }

  return { ...state, prompted, promptInstall }
}
