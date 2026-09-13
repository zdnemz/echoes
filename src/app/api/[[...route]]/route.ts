import { handle } from 'hono/vercel'
import { app } from '@/server/app'
import { isSupabaseConfigured } from '@/server/env'

/**
 * Hono mounted on the Next.js server — the single catch-all Route Handler.
 * Every API call (validation, docs, auth, data) flows through the Hono app
 * defined in src/server. Node runtime: the API talks to Supabase over HTTP.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Boot-time signal for deployment logs: names of vars only, never values.
// If this line appears, every data/auth call will answer 503 until the
// deployment is given SUPABASE_URL + SUPABASE_ANON_KEY and redeployed.
if (!isSupabaseConfigured()) {
  console.warn('[api] Supabase env vars missing (SUPABASE_URL / SUPABASE_ANON_KEY) — answering 503 until they are set')
}

export const GET = handle(app)
export const POST = handle(app)
export const PUT = handle(app)
export const PATCH = handle(app)
export const DELETE = handle(app)
export const HEAD = handle(app)
export const OPTIONS = handle(app)
