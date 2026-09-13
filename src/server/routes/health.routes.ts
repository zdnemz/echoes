import { createRoute, z } from '@hono/zod-openapi'
import { isSupabaseConfigured, hasServiceRole } from '../env'
import { getAuthClient } from '../supabase'
import { errorResponses, type App } from './helpers'

export function registerHealthRoutes(app: App) {
  const health = createRoute({
    method: 'get',
    path: '/health',
    tags: ['System'],
    summary: 'Backend health & configuration status',
    description:
      'Reports whether Supabase is configured/reachable. Returns 200 as long as the API itself is serving; individual checks are reported in the payload so the console page can render them.',
    responses: {
      200: {
        description: 'Health report',
        content: {
          'application/json': {
            schema: z.object({
              status: z.enum(['ok', 'degraded']),
              time: z.string().openapi({ format: 'date-time' }),
              supabase: z.object({
                configured: z.boolean(),
                service_role: z.boolean(),
                reachable: z.boolean().nullable().openapi({ description: 'null = not checked (not configured)' }),
                schema_ready: z
                  .boolean()
                  .nullable()
                  .openapi({ description: 'null = not checked; false = migrations not applied yet' }),
              }),
              version: z.string(),
            }),
          },
        },
      },
    },
  })
  app.openapi(health, async (c) => {
    const configured = isSupabaseConfigured()
    let reachable: boolean | null = null
    let schemaReady: boolean | null = null

    if (configured) {
      try {
        // Reaches PostgREST — also tells us whether migrations have been applied.
        const { error } = await getAuthClient().from('profiles').select('id', { head: true, count: 'exact' })
        reachable = !error
        schemaReady = !error
      } catch {
        reachable = false
        schemaReady = false
      }
    }

    const degraded = !configured || reachable === false || schemaReady === false

    return c.json({
      status: degraded ? 'degraded' : 'ok',
      time: new Date().toISOString(),
      supabase: {
        configured,
        service_role: hasServiceRole(),
        reachable,
        schema_ready: schemaReady,
      },
      version: '1.0.0',
    })
  })
}
