'use client'

import { useEffect } from 'react'

/**
 * Registers the service worker. Production only: Next's dev server uses HMR
 * and unpredictable asset URLs, so caching in dev would stale-serve through
 * every change and make development actively misleading.
 *
 * Registered (not imported as a module) so it stays out of the app bundle and
 * dies silently if blocked — a SW is a progressive enhancement, never a
 * dependency for the app to function.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return
    const register = () => navigator.serviceWorker.register('/sw.js').catch(() => {})
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
    return () => window.removeEventListener('load', register)
  }, [])
  return null
}
