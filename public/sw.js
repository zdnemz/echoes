/**
 * Echoes service worker — app-shell caching for PWA installability + offline
 * open. Deliberately *runtime* caching: Next.js asset names are hashed per
 * build, so a build-time precache manifest would drift on every deploy. Here
 * each asset class gets a strategy that self-heals instead.
 *
 *   navigations (HTML)  -> network-first, fall back to cached shell offline
 *   _next/static, fonts -> cache-first (immutable, content-hashed)
 *   same-origin images  -> stale-while-revalidate
 *   /api/**             -> NEVER cached; the offline data layer is IndexedDB,
 *                          and caching E2EE responses in the HTTP cache would
 *                          be both stale-prone and a privacy regression.
 */

const VERSION = 'v2'
const SHELL_CACHE = `echoes-shell-${VERSION}`
const ASSET_CACHE = `echoes-assets-${VERSION}`
const IMG_CACHE = `echoes-img-${VERSION}`

// Only unauthenticated public shells are precached. Gated routes like /journal
// are cached dynamically when visited while signed in, avoiding caching a 307
// redirect to /login during initial install.
const CORE_URLS = ['/', '/offline']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      // Best-effort: if the network is down at install time these fail and
      // activate() still proceeds — the shell gets filled in on first fetch.
      await Promise.allSettled(CORE_URLS.map((u) => cache.add(u)))
      self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE, IMG_CACHE])
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Never touch the API or auth — those must always hit the network.
  if (url.pathname.startsWith('/api/')) return

  // Bypass dev HMR and eventsource
  if (url.pathname.includes('/_next/webpack-hmr') || url.pathname.includes('/_next/hmr')) return

  // Same-origin only; cross-origin (fonts, Supabase) stays out of our caches.
  if (url.origin !== self.location.origin) return

  // Immutable build assets: serve from cache, populate on miss. Hashed names
  // make this safe — a new deploy's different filenames simply miss and fill.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request, ASSET_CACHE))
    return
  }

  if (request.destination === 'image') {
    event.respondWith(staleWhileRevalidate(request, IMG_CACHE))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
  }
})

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone())
      return response
    })
    .catch(() => cached)
  return cached || network
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE)
  const url = new URL(request.url)
  try {
    const response = await fetch(request)
    if (response.ok && !response.redirected) {
      cache.put(request, response.clone())
      if (url.pathname.startsWith('/journal')) {
        cache.put('/journal', response.clone())
      }
    }
    return response
  } catch {
    const cached = await cache.match(request)
    if (cached) return cached
    // If requesting any journal sub-route offline, serve the shared /journal shell
    if (url.pathname.startsWith('/journal')) {
      const journalShell = await cache.match('/journal')
      if (journalShell) return journalShell
    }
    const anyShell = await cache.match('/journal')
    return anyShell || (await cache.match('/offline')) || (await cache.match('/')) || Response.error()
  }
}
