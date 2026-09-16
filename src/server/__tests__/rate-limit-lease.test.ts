import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { assertUserBudget } from '../rate-limit'

/**
 * assertUserBudget used to make one Postgres round trip on every
 * authenticated request. The lease should turn a page-load burst into a
 * single flush. A fake PostgREST stands in for the hit store so the RPC
 * count is observable.
 */

let chargeCalls = 0
let chargedTotal = 0
let server: ReturnType<typeof Bun.serve>
let previousEnv: NodeJS.ProcessEnv

const fakeContext = (): unknown => ({ header: () => {} })

beforeAll(() => {
  previousEnv = { ...process.env }
  server = Bun.serve({
    port: 0,
    async fetch(req) {
      if (new URL(req.url).pathname.endsWith('/rpc/rate_limit_charge')) {
        chargeCalls += 1
        const body = (await req.json().catch(() => ({}))) as { p_count?: number }
        chargedTotal += Number(body.p_count ?? 1)
        return Response.json([{ hit_count: chargedTotal, oldest_at: null }])
      }
      return new Response('not found', { status: 404 })
    },
  })
  process.env.SUPABASE_URL = `http://127.0.0.1:${server.port}`
  process.env.SUPABASE_ANON_KEY = 'test-anon'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service'
})

afterAll(() => {
  server.stop()
  process.env = previousEnv
})

describe('assertUserBudget lease', () => {
  test('a burst of requests charges Postgres once, not per request', async () => {
    chargeCalls = 0
    chargedTotal = 0
    const ctx = fakeContext() as never
    for (let i = 0; i < 12; i++) await assertUserBudget(ctx, 'burst-user')
    expect(chargeCalls).toBe(1)
  })

  test('the lease flushes locally accumulated hits once it expires', async () => {
    chargeCalls = 0
    const ctx = fakeContext() as never
    for (let i = 0; i < 8; i++) await assertUserBudget(ctx, 'lease-user')
    expect(chargeCalls).toBe(1)
    // USER_LEASE_MS is 3s; the next burst opens a new lease and flushes
    // everything accumulated locally in one call.
    await new Promise((r) => setTimeout(r, 3200))
    for (let i = 0; i < 8; i++) await assertUserBudget(ctx, 'lease-user')
    expect(chargeCalls).toBe(2)
  }, 8000)

  test('exceeding the ceiling still throws 429 without a service role', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    try {
      const ctx = fakeContext() as never
      let thrown = 0
      // max is 240/min; the in-memory fallback must cap at the same place.
      for (let i = 0; i < 245; i++) {
        try {
          await assertUserBudget(ctx, 'ceiling-user')
        } catch {
          thrown += 1
        }
      }
      expect(thrown).toBe(5)
    } finally {
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service'
    }
  })
})
