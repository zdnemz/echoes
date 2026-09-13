import { createRoute, z } from '@hono/zod-openapi'
import { getAuthClient, getServiceClient, createUserClient } from '../supabase'
import { getAppUrl, getSupabaseConfig } from '../env'
import { ApiError, Errors, fromPostgrestError } from '../errors'
import {
  AuthUserSchema,
  LoginSchema,
  MagicLinkSchema,
  OAuthCallbackSchema,
  OAuthStartResponseSchema,
  OAuthStartSchema,
  ProfileSchema,
  RefreshSchema,
  SessionSchema,
  SignUpSchema,
  UpdatePasswordSchema,
  UpdateProfileSchema,
} from '../schemas'
import { requireAuth } from '../auth'
import { authRateLimit, emailRateLimit } from '../rate-limit'
import { bearerAuth, errorResponses, jsonBody, requireSupabaseConfig, type App } from './helpers'

/**
 * Auth routes — thin, validated proxies over Supabase Auth.
 * The returned access_token is the bearer token for every other endpoint.
 */

export function registerAuthRoutes(app: App) {
  // ----------------------------------------------------------------- signup
  const signUp = createRoute({
    method: 'post',
    path: '/auth/signup',
    tags: ['Auth'],
    summary: 'Sign up with email and password',
    middleware: [authRateLimit()],
    description:
      'Creates the auth user and a profile row (profile creation happens via a database trigger). If email confirmation is disabled on the project, the response already contains a usable bearer token; otherwise the session is null until the user confirms their email.',
    request: { body: jsonBody(SignUpSchema) },
    responses: {
      ...errorResponses(400, 422, 503),
      201: {
        description: 'Account created (session is null when email confirmation is pending)',
        content: { 'application/json': { schema: SessionSchema.nullable() } },
      },
    },
  })
  app.openapi(signUp, async (c) => {
    requireSupabaseConfig()
    const { email, password, display_name } = c.req.valid('json')
    const supabase = getAuthClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: display_name ?? '' } },
    })
    if (error) throw new ApiError(400, 'AUTH_ERROR', error.message)

    return c.json(sessionOrNull(data.session, data.user), 201)
  })

  // ----------------------------------------------------------------- login
  const login = createRoute({
    method: 'post',
    path: '/auth/login',
    tags: ['Auth'],
    summary: 'Log in with email and password',
    middleware: [authRateLimit()],
    request: { body: jsonBody(LoginSchema) },
    responses: {
      ...errorResponses(400, 401, 422, 503),
      200: { description: 'Session created', content: { 'application/json': { schema: SessionSchema } } },
    },
  })
  app.openapi(login, async (c) => {
    requireSupabaseConfig()
    const { email, password } = c.req.valid('json')
    const supabase = getAuthClient()

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.session || !data.user) throw Errors.unauthorized(error?.message ?? 'Invalid credentials')

    return c.json(sessionFrom(data.session, data.user))
  })

  // ----------------------------------------------------------------- magic link
  const magicLink = createRoute({
    method: 'post',
    path: '/auth/magic-link',
    tags: ['Auth'],
    summary: 'Request a magic sign-in link',
    middleware: [authRateLimit(), emailRateLimit()],
    description:
      'Sends a one-time sign-in link via Supabase Auth email. When the service role key is configured and NODE_ENV is not production, the response also includes the generated link (dev mode) so the flow is testable without an inbox.',
    request: { body: jsonBody(MagicLinkSchema) },
    responses: {
      ...errorResponses(400, 422, 503),
      200: {
        description: 'Magic link sent',
        content: {
          'application/json': {
            schema: z.object({
              message: z.string().openapi({ example: 'Magic link sent — check your inbox' }),
              dev_link: z.string().nullable().openapi({
                description: 'Present only in dev mode with the service role key configured',
                example: 'https://xxxx.supabase.co/auth/v1/verify?token=…&redirect_to=…',
              }),
            }),
          },
        },
      },
    },
  })
  app.openapi(magicLink, async (c) => {
    requireSupabaseConfig()
    const { email, redirect_to } = c.req.valid('json')
    const supabase = getAuthClient()
    // Open-redirect guard: the magic link carries a session token, so the
    // redirect target must stay on this deployment. Anything else is dropped
    // (the email still sends — it just lands on the default callback).
    let emailRedirectTo: string | undefined
    if (redirect_to) {
      try {
        const appOrigin = new URL(getAppUrl()).origin
        if (new URL(redirect_to).origin === appOrigin) emailRedirectTo = redirect_to
      } catch {
        /* malformed URL — fall through to the default */
      }
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        ...(emailRedirectTo ? { emailRedirectTo } : {}),
      },
    })
    if (error) throw new ApiError(400, 'AUTH_ERROR', error.message)

    let devLink: string | null = null
    if (process.env.NODE_ENV !== 'production') {
      const service = getServiceClient()
      if (service) {
        const { data: link } = await service.auth.admin.generateLink({ type: 'magiclink', email })
        if (link?.properties?.action_link) devLink = link.properties.action_link
      }
    }

    return c.json({ message: 'Magic link sent — check your inbox', dev_link: devLink })
  })

  // ----------------------------------------------------------------- me
  const me = createRoute({
    method: 'get',
    path: '/auth/me',
    tags: ['Auth'],
    summary: 'Current user + profile',
    security: [bearerAuth],
    middleware: [requireAuth],
    responses: {
      ...errorResponses(401, 503),
      200: { description: 'Current user', content: { 'application/json': { schema: AuthUserSchema } } },
    },
  })
  app.openapi(me, async (c) => {
    const user = c.var.user
    const { data: profile, error } = await c.var.userClient
      .from('profiles')
      .select('display_name, created_at')
      .eq('id', user.id)
      .maybeSingle()
    if (error) throw fromPostgrestError(error)

    return c.json({
      id: user.id,
      email: user.email,
      display_name: profile?.display_name ?? '',
      created_at: profile?.created_at ?? new Date().toISOString(),
    })
  })

  // ----------------------------------------------------------------- profile
  const updateProfile = createRoute({
    method: 'patch',
    path: '/auth/profile',
    tags: ['Auth'],
    summary: 'Update your display name',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { body: jsonBody(UpdateProfileSchema) },
    responses: {
      ...errorResponses(400, 401, 403, 422, 503),
      200: { description: 'Updated profile', content: { 'application/json': { schema: ProfileSchema } } },
    },
  })
  app.openapi(updateProfile, async (c) => {
    const { display_name } = c.req.valid('json')
    const user = c.var.user

    const { data: profile, error } = await c.var.userClient
      .from('profiles')
      .update({ display_name })
      .eq('id', user.id)
      .select('id, display_name, created_at')
      .single()
    if (error) throw fromPostgrestError(error)
    if (!profile) throw Errors.notFound('Profile not found')

    return c.json({ ...profile, email: user.email ?? '' })
  })

  // ----------------------------------------------------------------- password
  const updatePassword = createRoute({
    method: 'post',
    path: '/auth/password',
    tags: ['Auth'],
    summary: 'Change your password',
    description:
      'Updates the password on the caller’s own auth user. OAuth-only accounts (no password set) gain one; existing sessions stay valid.',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { body: jsonBody(UpdatePasswordSchema) },
    responses: {
      ...errorResponses(400, 401, 422, 503),
      200: {
        description: 'Password changed',
        content: {
          'application/json': { schema: z.object({ message: z.string().openapi({ example: 'Password updated' }) }) },
        },
      },
    },
  })
  app.openapi(updatePassword, async (c) => {
    const { password } = c.req.valid('json')

    // supabase-js updateUser() needs a stateful session, which the
    // per-request RLS client deliberately does not keep — so call GoTrue's
    // update-user endpoint directly with the verified bearer token.
    const cfg = getSupabaseConfig()
    if (!cfg) throw Errors.supabaseNotConfigured()
    let res: Response
    try {
      res = await fetch(`${cfg.url}/auth/v1/user`, {
        method: 'PUT',
        headers: { apikey: cfg.anonKey, Authorization: `Bearer ${c.var.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      })
    } catch (cause) {
      throw new ApiError(502, 'AUTH_UPSTREAM', 'Could not reach the auth provider', { cause: [String(cause)] })
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { msg?: string; error_description?: string } | null
      throw new ApiError(400, 'AUTH_ERROR', body?.msg ?? body?.error_description ?? 'Could not update the password')
    }

    return c.json({ message: 'Password updated' })
  })

  // ----------------------------------------------------------------- google oauth (PKCE)
  const oauthStart = createRoute({
    method: 'post',
    path: '/auth/oauth/start',
    tags: ['Auth'],
    summary: 'Begin an OAuth flow (Google) — returns the authorize URL',
    middleware: [authRateLimit()],
    description:
      'The client generates a PKCE code_verifier, sends its SHA-256 challenge, and is redirected to the returned authorize_url. After the provider round-trip Supabase appends ?code=… to APP_URL/auth/callback, which exchanges it via /auth/oauth/callback. The redirect is built server-side from APP_URL — client-supplied redirect targets are never honored.',
    request: { body: jsonBody(OAuthStartSchema) },
    responses: {
      ...errorResponses(400, 422, 429, 503),
      200: { description: 'Authorize URL', content: { 'application/json': { schema: OAuthStartResponseSchema } } },
    },
  })
  app.openapi(oauthStart, async (c) => {
    requireSupabaseConfig()
    const { provider, code_challenge } = c.req.valid('json')
    const cfg = getSupabaseConfig()!

    const callbackUrl = `${getAppUrl()}/auth/callback`
    const authorize = new URL(`${cfg.url}/auth/v1/authorize`)
    authorize.searchParams.set('provider', provider)
    authorize.searchParams.set('redirect_to', callbackUrl)
    authorize.searchParams.set('code_challenge', code_challenge)
    authorize.searchParams.set('code_challenge_method', 's256')
    // Google: profile + email are the scopes the profile trigger needs.
    authorize.searchParams.set('scopes', 'email profile')

    return c.json({ authorize_url: authorize.toString() })
  })

  const oauthCallback = createRoute({
    method: 'post',
    path: '/auth/oauth/callback',
    tags: ['Auth'],
    summary: 'Exchange the OAuth code for a session (PKCE)',
    middleware: [authRateLimit()],
    description:
      'Proxies the Supabase token endpoint (grant_type=pkce) with the client-stored verifier, so the anon key never reaches the browser. Google-created users get a profile row through the same database trigger as signup; a display name is backfilled from the provider metadata when present.',
    request: { body: jsonBody(OAuthCallbackSchema) },
    responses: {
      ...errorResponses(400, 401, 422, 429, 502, 503),
      200: { description: 'Session created', content: { 'application/json': { schema: SessionSchema } } },
    },
  })
  app.openapi(oauthCallback, async (c) => {
    requireSupabaseConfig()
    const { auth_code, code_verifier } = c.req.valid('json')

    const session = await tokenGrant('pkce', { auth_code, code_verifier })

    // Best-effort: surface the provider's name in shared notebooks.
    if (session.user.display_name === null) {
      try {
        const meta = session.rawUser?.raw_user_meta_data as Record<string, unknown> | null | undefined
        const name = [meta?.full_name, meta?.name, meta?.display_name].find(
          (v): v is string => typeof v === 'string' && v.length > 0,
        )
        if (name) {
          const userClient = createUserClient(session.access_token)
          await userClient
            .from('profiles')
            .update({ display_name: name.slice(0, 80) })
            .eq('id', session.user.id)
          session.user.display_name = name.slice(0, 80)
        }
      } catch {
        // cosmetic only
      }
    }

    return c.json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    })
  })

  // ----------------------------------------------------------------- refresh
  const refresh = createRoute({
    method: 'post',
    path: '/auth/refresh',
    tags: ['Auth'],
    summary: 'Exchange a refresh token for a new session',
    middleware: [authRateLimit()],
    description:
      'Proxies the Supabase token endpoint (grant_type=refresh_token). The client calls this transparently when a bearer token expires, so sessions survive without re-authenticating.',
    request: { body: jsonBody(RefreshSchema) },
    responses: {
      ...errorResponses(400, 401, 422, 429, 502, 503),
      200: { description: 'Session renewed', content: { 'application/json': { schema: SessionSchema } } },
    },
  })
  app.openapi(refresh, async (c) => {
    requireSupabaseConfig()
    const { refresh_token } = c.req.valid('json')

    const session = await tokenGrant('refresh_token', { refresh_token })

    return c.json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    })
  })

  // ----------------------------------------------------------------- logout
  const logout = createRoute({
    method: 'post',
    path: '/auth/logout',
    tags: ['Auth'],
    summary: 'Revoke the current session token',
    description:
      'With a bearer-token client, dropping the token client-side is the sign-out; this endpoint additionally asks Supabase Auth to revoke the underlying session (best effort).',
    security: [bearerAuth],
    middleware: [requireAuth],
    responses: {
      ...errorResponses(401, 503),
      200: {
        description: 'Token revoked',
        content: {
          'application/json': { schema: z.object({ message: z.string().openapi({ example: 'Signed out' }) }) },
        },
      },
    },
  })
  app.openapi(logout, async (c) => {
    // auth.admin.signOut needs the service_role key; the anon client used to
    // always fail here (silently), so sessions were never revoked server-side.
    try {
      const service = getServiceClient()
      if (service) await service.auth.admin.signOut(c.var.token)
      else await c.var.userClient.auth.signOut()
    } catch {
      // best-effort only
    }
    return c.json({ message: 'Signed out' })
  })
}

/** Shape the Supabase auth response into our Session schema (or null). */

interface TokenGrantUser {
  id: string
  email?: string | null
  created_at?: string
  raw_user_meta_data?: Record<string, unknown> | null
}

interface RawTokenSession {
  access_token: string
  refresh_token: string | null
  expires_in: number | null
  token_type?: string | null
  user?: TokenGrantUser | null
}

/**
 * Direct call to the Supabase Auth token endpoint (PKCE code exchange or
 * refresh-token rotation). Kept here, server-side, so the anon key and the
 * grant details never touch the browser.
 */
async function tokenGrant(
  grantType: 'pkce' | 'refresh_token',
  body: Record<string, string>,
): Promise<{
  access_token: string
  refresh_token: string | null
  expires_in: number | null
  token_type: string
  user: { id: string; email: string | null; display_name: string | null; created_at: string }
  rawUser?: TokenGrantUser
}> {
  const cfg = getSupabaseConfig()
  if (!cfg) throw Errors.supabaseNotConfigured()

  let res: Response
  try {
    res = await fetch(`${cfg.url}/auth/v1/token?grant_type=${grantType}`, {
      method: 'POST',
      headers: { apikey: cfg.anonKey, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (cause) {
    throw new ApiError(502, 'AUTH_UPSTREAM', 'Could not reach the auth provider', { cause: [String(cause)] })
  }

  const payload = (await res.json().catch(() => null)) as
    (RawTokenSession & { error?: string; error_description?: string; msg?: string }) | null

  if (!res.ok || !payload?.access_token || !payload?.user) {
    const message =
      payload?.error_description ?? payload?.msg ?? payload?.error ?? 'The code or refresh token was rejected'
    // Supabase returns 400 for both malformed and expired/reused inputs.
    const status = res.status === 400 ? 401 : res.status >= 500 ? 502 : 401
    throw new ApiError(status, 'AUTH_ERROR', message)
  }

  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token ?? null,
    expires_in: payload.expires_in ?? null,
    token_type: payload.token_type ?? 'bearer',
    user: {
      id: payload.user.id,
      email: payload.user.email ?? null,
      display_name:
        (typeof payload.user.raw_user_meta_data?.display_name === 'string'
          ? payload.user.raw_user_meta_data.display_name
          : null) ?? null,
      created_at: payload.user.created_at ?? new Date().toISOString(),
    },
    rawUser: payload.user,
  }
}

function sessionFrom(
  session: {
    access_token: string
    refresh_token: string | null
    expires_in: number | null
    token_type?: string | null
  },
  user: { id: string; email?: string | null; created_at?: string; raw_user_meta_data?: Record<string, unknown> | null },
) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token ?? null,
    expires_in: session.expires_in ?? null,
    token_type: session.token_type ?? 'bearer',
    user: {
      id: user.id,
      email: user.email ?? null,
      display_name:
        (typeof user.raw_user_meta_data?.display_name === 'string' ? user.raw_user_meta_data.display_name : null) ??
        null,
      created_at: user.created_at ?? new Date().toISOString(),
    },
  }
}

function sessionOrNull(
  session: {
    access_token: string
    refresh_token: string | null
    expires_in: number | null
    token_type?: string | null
  } | null,
  user: {
    id: string
    email?: string | null
    created_at?: string
    raw_user_meta_data?: Record<string, unknown> | null
  } | null,
) {
  if (!session || !user) return null
  return sessionFrom(session, user)
}
