import { OpenAPIHono } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'
import { HTTPException } from 'hono/http-exception'
import { ApiError, fromPostgrestError, zodFieldErrors } from './errors'
import type { AppEnv } from './types'
import { registerAuthRoutes } from './routes/auth.routes'
import { registerNotebookRoutes } from './routes/notebooks.routes'
import { registerEntryRoutes } from './routes/entries.routes'
import { registerSearchRoutes } from './routes/search.routes'
import { registerGroupRoutes } from './routes/groups.routes'
import { registerReflectRoutes } from './routes/reflect.routes'
import { registerRealtimeRoutes } from './routes/realtime.routes'
import { registerInviteRoutes } from './routes/invites.routes'
import { registerCryptoRoutes } from './routes/crypto.routes'
import { registerHealthRoutes } from './routes/health.routes'

/**
 * The Hono API — mounted on the Next.js server at /api via the
 * [[...route]] catch-all Route Handler.
 *
 * - Every route is created with `createRoute` + Zod schemas, so request
 *   validation and OpenAPI documentation are generated from one source.
 * - The OpenAPI 3.1 document and the Scalar docs UI are served at
 *   GET /api/doc and GET /api/docs in development only — production
 *   deployments return 404 for both (they are internal dev surfaces).
 */

const IS_DEV = process.env.NODE_ENV !== 'production'

export function createApp(): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>({
    // Uniform 422 envelope for request validation failures.
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Request validation failed',
              details: zodFieldErrors(result.error),
            },
          },
          422,
        )
      }
    },
  }).basePath('/api') // mounted on the Next.js server at /api via [[...route]]

  // ---------------------------------------------------------------- security
  app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Supabase access token returned by POST /api/auth/login or /api/auth/signup',
  })

  // ---------------------------------------------------------------- routes
  app.get('/', (c) =>
    c.json({
      name: 'Journaling API',
      version: '1.0.0',
      health: '/api/health',
      ...(IS_DEV ? { docs: '/api/docs', openapi: '/api/doc' } : {}),
    }),
  )

  registerHealthRoutes(app)
  registerAuthRoutes(app)
  registerNotebookRoutes(app)
  registerEntryRoutes(app)
  registerSearchRoutes(app)
  registerGroupRoutes(app)
  registerReflectRoutes(app)
  registerRealtimeRoutes(app)
  registerInviteRoutes(app)
  registerCryptoRoutes(app)

  // ---------------------------------------------------------------- OpenAPI docs (dev only)
  if (IS_DEV) {
    app.doc31('/doc', {
      openapi: '3.1.0',
      info: {
        title: 'Journaling API',
        version: '1.0.0',
        description:
          'Backend for the journaling app: private notebooks of markdown entries with tags and moods, small-group sharing with per-entry opt-out, invites and search. **Every user-scoped call requires `Authorization: Bearer <access_token>`** (see POST /auth/login). Row-level visibility is enforced by Postgres RLS, not just this API.',
        license: { name: 'MIT' },
      },
      // Note: with basePath('/api'), generated paths already carry the /api
      // prefix, so the server entry must NOT repeat it (try-it requests
      // resolve against the deployment origin).
      servers: [{ url: '/', description: 'This deployment (mounted on the Next.js server)' }],
      tags: [
        { name: 'Auth', description: 'Sign up, log in, Google OAuth (PKCE), magic links, current user' },
        { name: 'Notebooks', description: 'Private notebooks + group sharing link' },
        { name: 'Entries', description: 'Markdown journal entries with mood and tags' },
        { name: 'Search', description: 'Search across your own entries' },
        { name: 'Groups', description: 'Small sharing groups with owner/member roles' },
        { name: 'Reflect', description: 'Agentic journaling companion over notebooks you pick' },
        { name: 'Invites', description: 'Single-use, expiring email invites' },
        {
          name: 'Encryption',
          description: 'End-to-end encryption key relay — opaque blobs only, the server cannot decrypt anything',
        },
        { name: 'System', description: 'Health and system status' },
      ],
    })

    // Scalar API reference — native docs UI for the OpenAPI document.
    app.get('/docs', Scalar({ url: '/api/doc' }))
  }

  // ---------------------------------------------------------------- error mapping
  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json(
        { error: { code: err.code, message: err.message, details: err.details ?? null } },
        err.status as 200,
      )
    }

    // Hono's own errors (HTTPException). Without this branch a rejected
    // content-type — @hono/zod-openapi throws HTTPException(415) from its
    // media-type gate — falls through to a 500 INTERNAL.
    if (err instanceof HTTPException) {
      const code = err.status === 415 ? 'UNSUPPORTED_MEDIA_TYPE' : err.status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR'
      return c.json({ error: { code, message: err.message, details: null } }, err.status as 200)
    }

    // PostgREST errors surfacing as thrown objects
    if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
      const mapped = fromPostgrestError(err as { code?: string; message: string })
      return c.json(
        { error: { code: mapped.code, message: mapped.message, details: mapped.details ?? null } },
        mapped.status as 200,
      )
    }

    console.error('[api] unhandled error:', err)
    return c.json({ error: { code: 'INTERNAL', message: 'Unexpected server error' } }, 500)
  })

  app.notFound((c) =>
    c.json({ error: { code: 'NOT_FOUND', message: `No such route: ${c.req.method} ${c.req.path}` } }, 404),
  )

  return app
}

// Singleton shared by the Next.js route handler.
export const app = createApp()
