import type { MiddlewareHandler } from 'hono'
import { getAuthClient, createUserClient } from './supabase'
import { Errors } from './errors'
import type { AppEnv } from './types'

export interface AppUser {
  id: string
  email: string | null
}

/**
 * Extracts and validates the Supabase JWT from the Authorization header,
 * verifies it against Supabase Auth, and attaches:
 *   c.var.user       — { id, email }
 *   c.var.userClient — RLS-scoped Supabase client for this request
 *
 * The user is ALWAYS derived from the verified session token — never from a
 * client-supplied id (PRD §8 security).
 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header('authorization') ?? ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''

  if (!token) throw Errors.unauthorized('Missing Authorization: Bearer <token> header')

  let authClient
  try {
    authClient = getAuthClient()
  } catch {
    throw Errors.supabaseNotConfigured()
  }

  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data?.user) {
    throw Errors.unauthorized('Invalid or expired session token')
  }

  c.set('user', { id: data.user.id, email: data.user.email ?? null })
  c.set('userClient', createUserClient(token))
  c.set('token', token)

  await next()
}
