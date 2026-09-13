import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppUser } from './auth'

/**
 * Hono environment: variables attached by middleware for every route handler.
 */
export interface AppEnv {
  Variables: {
    /** Authenticated user (set by requireAuth middleware). */
    user: AppUser
    /** RLS-scoped Supabase client bound to the user's JWT (set by requireAuth). */
    userClient: SupabaseClient
    /** Raw bearer token of the current request (empty string when absent). */
    token: string
  }
}
