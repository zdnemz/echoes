// Smoke test: verify the API surface of @hono/zod-openapi + @scalar/hono-api-reference
// against the installed versions before building the full server.
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Scalar } from '@scalar/hono-api-reference'

const has = (v: unknown, name: string) => {
  if (v === undefined || v === null) throw new Error(`MISSING: ${name}`)
  console.log(`ok: ${name}`)
}

has(z.email, 'z.email')
has(z.uuid, 'z.uuid')
has(z.iso?.datetime, 'z.iso.datetime')
has(Scalar, 'Scalar middleware')
has(Scalar.serve, 'Scalar.serve')

const app = new OpenAPIHono()
has(app.doc31, 'app.doc31')
has(app.openapi, 'app.openapi')
has(app.openAPIRegistry, 'app.openAPIRegistry')

const route = createRoute({
  method: 'get',
  path: '/ping/{id}',
  request: {
    params: z.object({
      id: z.uuid().openapi({ param: { name: 'id', in: 'path' } }),
    }),
  },
  responses: {
    200: {
      description: 'ok',
      content: { 'application/json': { schema: z.object({ pong: z.boolean() }) } },
    },
  },
})

app.openapi(route, (c) => c.json({ pong: true }, 200))

app.doc31('/doc', { openapi: '3.1.0', info: { title: 'smoke', version: '1.0.0' } })
app.get('/docs', Scalar({ url: '/doc' }))

const res = await app.request('/ping/123e4567-e89b-12d3-a456-426614174000')
console.log('ping status:', res.status, await res.json())

const bad = await app.request('/ping/not-a-uuid')
console.log('bad param status:', bad.status, await bad.json())

const docRes = await app.request('/doc')
const doc = (await docRes.json()) as { openapi?: string; paths?: unknown }
console.log('doc openapi version:', doc.openapi, 'paths:', Object.keys(doc.paths ?? {}))

const uiRes = await app.request('/docs')
console.log('scalar UI status:', uiRes.status, 'content-type:', uiRes.headers.get('content-type'))

console.log('\nALL SMOKE TESTS PASSED')
