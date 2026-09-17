import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { getCachedReflection, reflectCacheKey, setCachedReflection } from '../cache'

/**
 * The key function is the security-relevant logic: it must bind the user,
 * ignore input ordering, and change when the thread or entry context changes.
 * Backend get/set is exercised against the in-memory store (the no-config
 * path); the Redis/Postgres backends are integration-shaped and covered by
 * the live stack, not by unit mocks.
 */

const baseMsgs = [{ role: 'user' as const, content: 'How was my week?' }]
const baseCtx = [
  { id: 'e1', title: 'Monday', body: 'Ran 5k', mood: 'good', tags: ['run'] },
  { id: 'e2', title: 'Tuesday', body: 'Tired', mood: 'low', tags: ['work'] },
]

let previousEnv: NodeJS.ProcessEnv

// Env is cleared for the whole file: the service-role key from .env would
// otherwise resolve the backend to Postgres and these tests would try to
// reach the local stack. Restored once in afterAll.
beforeAll(() => {
  previousEnv = { ...process.env }
  delete process.env.REDIS_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
})

afterAll(() => {
  process.env = previousEnv
})

describe('reflectCacheKey', () => {
  test('is stable for identical input', () => {
    const a = reflectCacheKey('u1', ['n1', 'n2'], baseMsgs, baseCtx)
    const b = reflectCacheKey('u1', ['n1', 'n2'], baseMsgs, baseCtx)
    expect(a).toBe(b)
  })

  test('ignores notebook order', () => {
    expect(reflectCacheKey('u1', ['n1', 'n2'], baseMsgs)).toBe(reflectCacheKey('u1', ['n2', 'n1'], baseMsgs))
  })

  test('ignores context entry order and tag order', () => {
    const reordered = [
      { id: 'e2', title: 'Tuesday', body: 'Tired', mood: 'low', tags: ['work'] },
      { id: 'e1', title: 'Monday', body: 'Ran 5k', mood: 'good', tags: ['run'] },
    ]
    expect(reflectCacheKey('u1', ['n1'], baseMsgs, baseCtx)).toBe(reflectCacheKey('u1', ['n1'], baseMsgs, reordered))
  })

  test('differs per user — one user cannot read another cache entry', () => {
    expect(reflectCacheKey('u1', ['n1'], baseMsgs)).not.toBe(reflectCacheKey('u2', ['n1'], baseMsgs))
  })

  test('changes when the message thread changes', () => {
    const withReply = [...baseMsgs, { role: 'assistant' as const, content: 'You ran a 5k.' }]
    expect(reflectCacheKey('u1', ['n1'], baseMsgs)).not.toBe(reflectCacheKey('u1', ['n1'], withReply))
  })

  test('changes when entry content changes — a stale reflection is never served', () => {
    const edited = [{ ...baseCtx[0], body: 'Ran 10k' }]
    expect(reflectCacheKey('u1', ['n1'], baseMsgs, baseCtx)).not.toBe(reflectCacheKey('u1', ['n1'], baseMsgs, edited))
  })

  test('treats missing context and empty context identically', () => {
    expect(reflectCacheKey('u1', ['n1'], baseMsgs)).toBe(reflectCacheKey('u1', ['n1'], baseMsgs, []))
  })
})

describe('in-memory backend', () => {
  test('stores and replays a reflection under the same key', async () => {
    const key = reflectCacheKey('u1', ['n1'], baseMsgs)
    expect(await getCachedReflection('u1', key)).toBeNull()

    await setCachedReflection('u1', key, { reply: 'You ran a 5k.', toolsUsed: ['list_entries'], model: 'gpt-4o-mini' })

    const hit = await getCachedReflection('u1', key)
    expect(hit).toEqual({ reply: 'You ran a 5k.', toolsUsed: ['list_entries'], model: 'gpt-4o-mini' })
  })

  test('is user-isolated: a second user sees no hit on the same content', async () => {
    const key = reflectCacheKey('u1', ['n1'], baseMsgs)
    await setCachedReflection('u1', key, { reply: 'private', toolsUsed: [], model: 'm' })
    expect(await getCachedReflection('u2', key)).toBeNull()
  })
})
