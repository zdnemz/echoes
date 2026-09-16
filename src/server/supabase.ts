import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseConfig } from './env'

/**
 * Supabase client factory.
 *
 * Three flavours:
 *  1. authClient    — anon key, used to proxy Supabase Auth (sign up, login…)
 *  2. serviceClient — service_role key, bypasses RLS. ONLY for seeding and
 *                     admin-only tasks. Returns null when not configured.
 *  3. userClient    — anon key + the user's JWT as Authorization header, so
 *                     PostgREST evaluates every query under RLS. This is the
 *                     client all data routes use: the DB layer is the actual
 *                     enforcement point of the visibility rule.
 */

const globalForSupabase = globalThis as unknown as {
  __authClient?: SupabaseClient
  __serviceClient?: SupabaseClient | null
}

/** Cached anon client for auth-proxy endpoints (signup/login/magic link). */
export function getAuthClient(): SupabaseClient {
  const config = getSupabaseConfig()
  if (!config) throw new Error('SUPABASE_NOT_CONFIGURED')

  if (!globalForSupabase.__authClient) {
    globalForSupabase.__authClient = createClient(config.url, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return globalForSupabase.__authClient
}

/** Service-role client (RLS bypass) or null when the key is not configured. */
export function getServiceClient(): SupabaseClient | null {
  const config = getSupabaseConfig()
  if (!config || !config.serviceRoleKey) return null

  if (globalForSupabase.__serviceClient === undefined) {
    globalForSupabase.__serviceClient = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return globalForSupabase.__serviceClient
}

/**
 * Per-request RLS-scoped client. All reads/writes through this client are
 * filtered by the row level security policies defined in the SQL migration.
 *
 * Cached per token: building a Supabase client sets up a fetch wrapper, a
 * GoTrue client and a storage client every time, and every authenticated
 * request needs one. A bounded map keyed by the jwt reuses it across the
 * burst of calls a single page load makes. The client is stateless for our
 * purposes (persistSession false, no channels), so reuse is safe.
 */
const userClientCache = new Map<string, SupabaseClient>()
const USER_CLIENT_CACHE_MAX = 128

export function createUserClient(jwt: string): SupabaseClient {
  const config = getSupabaseConfig()
  if (!config) throw new Error('SUPABASE_NOT_CONFIGURED')

  const cached = userClientCache.get(jwt)
  if (cached) return cached

  const client = createClient(config.url, config.anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  if (userClientCache.size >= USER_CLIENT_CACHE_MAX) userClientCache.clear()
  userClientCache.set(jwt, client)
  return client
}
