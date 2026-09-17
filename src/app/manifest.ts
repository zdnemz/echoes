import type { MetadataRoute } from 'next'

/**
 * Web app manifest — makes Echoes installable ("Add to Home Screen") on
 * iOS/Android. Served by Next.js at /manifest.webmanifest and linked from the
 * root layout metadata.
 *
 * `display: standalone` so a home-screen launch reads as the app itself, with
 * no browser chrome — Echoes is a writing surface, not a tab.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Echoes — a quiet place for loud thoughts',
    short_name: 'Echoes',
    description:
      'A private journal: markdown entries with moods and tags, sealed with end-to-end encryption before they leave your device.',
    start_url: '/journal',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#0a0a0a',
    categories: ['lifestyle', 'productivity', 'books'],
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
