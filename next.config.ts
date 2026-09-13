import type { NextConfig } from 'next'

/**
 * Security headers applied to every response. CSP is deliberately pragmatic:
 * Next.js hydration + inline style tags (Tailwind) require 'unsafe-inline'
 * for styles; scripts allow self plus the Supabase auth redirect round-trip
 * happens server-side (no third-party scripts are loaded at all).
 */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // Applies only once served over HTTPS; harmless on localhost.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
]

// Production-only CSP: development needs 'unsafe-eval' for the Next.js
// compiler, so the policy ships where it protects (prod) and stays out of
// the way where it would break the toolchain (dev).
const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js hydration emits inline scripts; no third-party scripts exist.
  "script-src 'self' 'unsafe-inline'",
  // Tailwind + Radix rely on inline <style> tags.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https: blob:",
  "font-src 'self' data:",
  // Same-origin API/gateway plus Supabase Auth/PostgREST over https/wss.
  "connect-src 'self' https: wss:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ')

const isProd = process.env.NODE_ENV === 'production'

const nextConfig: NextConfig = {
  output: 'standalone',
  // Type errors must fail the build — no masks in production.
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    const headers = [...securityHeaders]
    if (isProd) headers.push({ key: 'Content-Security-Policy', value: contentSecurityPolicy })
    return [{ source: '/:path*', headers }]
  },
}

export default nextConfig
