import type { MetadataRoute } from 'next'

/**
 * robots.txt — marketing pages are crawlable; every app surface
 * (journal, auth, invites, console, API) is excluded.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? 'http://localhost:3000'
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/journal', '/auth', '/invites', '/console', '/api'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
