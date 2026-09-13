import { handle } from 'hono/vercel'
import { app } from '@/server/app'

/**
 * Hono mounted on the Next.js server — the single catch-all Route Handler.
 * Every API call (validation, docs, auth, data) flows through the Hono app
 * defined in src/server. Node runtime: the API talks to Supabase over HTTP.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = handle(app)
export const POST = handle(app)
export const PUT = handle(app)
export const PATCH = handle(app)
export const DELETE = handle(app)
export const HEAD = handle(app)
export const OPTIONS = handle(app)
