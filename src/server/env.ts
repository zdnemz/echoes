/**
 * Lazy environment access.
 *
 * The app must boot (build, lint, dev, CI) even when Supabase credentials are
 * absent — requests that need them fail gracefully with 503 instead.
 */

export interface SupabaseConfig {
  url: string
  anonKey: string
  serviceRoleKey: string | null
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  return {
    url,
    anonKey,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? null,
  }
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null
}

export function hasServiceRole(): boolean {
  const cfg = getSupabaseConfig()
  return cfg !== null && cfg.serviceRoleKey !== null
}

/** Public base URL of the app, used to build invite accept links. */
export function getAppUrl(): string {
  return process.env.APP_URL ?? 'http://localhost:3000'
}
