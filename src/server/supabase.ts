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
 */
export function createUserClient(jwt: string): SupabaseClient {
  const config = getSupabaseConfig()
  if (!config) throw new Error('SUPABASE_NOT_CONFIGURED')

  return createClient(config.url, config.anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
