import { describe, expect, test } from 'bun:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildTools, type ContextEntry } from '../routes/reflect.routes'

/**
 * The tools' database fallback is what the agent sees when the client shipped
 * no decrypted bundle (cold load, or a vault with no device keys). Sealed rows
 * must surface as an explicit marker — never as ciphertext the model would
 * mistake for the entry's words.
 */

// Every chainable PostgREST method resolves to the same terminal payload; the
// tools only read `data`/`error` at the end.
function fakeClient(terminal: unknown): SupabaseClient {
  const q: Record<string, unknown> = {
    data: terminal,
    error: null,
    select: () => q,
    eq: () => q,
    in: () => q,
    or: () => q,
    order: () => q,
    limit: () => q,
    gte: () => q,
    maybeSingle: () => q,
  }
  return { from: () => q } as unknown as SupabaseClient
}

const owned = new Set(['nb-1'])
const CIPHER = 'v1.8Z2dx9kP0q4rT1vB7nM2cF6hJ5lX0aD3sY8uI4oZ9bE2wV7'

describe('reflect tools — sealed fallback', () => {
  test('list_entries marks encrypted rows instead of returning ciphertext', async () => {
    const tools = buildTools(fakeClient([{ id: 'e1', title: CIPHER, body: CIPHER, encrypted: true }]), owned)
    const out = (await tools[0].run({ notebook_id: 'nb-1', limit: 8 })) as Array<{ title: string; preview: string }>
    expect(out[0].title).toBe('[sealed — this entry is end-to-end encrypted and its words are not readable here]')
    expect(out[0].preview).toBe('[sealed — this entry is end-to-end encrypted and its words are not readable here]')
  })

  test('read_entry marks an encrypted row instead of handing the model base64', async () => {
    const tools = buildTools(
      fakeClient({ id: 'e1', notebook_id: 'nb-1', title: CIPHER, body: CIPHER, encrypted: true }),
      owned,
    )
    const out = (await tools[1].run({ entry_id: 'e1' })) as { title: string; body: string }
    expect(out.body).not.toContain('v1.')
    expect(out.title).toContain('sealed')
  })

  test('plaintext rows still pass through untouched', async () => {
    const tools = buildTools(
      fakeClient({ id: 'e2', notebook_id: 'nb-1', title: 'Beach day', body: 'Salt and sun.' }),
      owned,
    )
    const out = (await tools[1].run({ entry_id: 'e2' })) as {
      id: string
      notebook_id: string
      title: string
      body: string
    }
    expect(out).toEqual({ id: 'e2', notebook_id: 'nb-1', title: 'Beach day', body: 'Salt and sun.' })
  })

  test('a decrypted context bundle overrides the database entirely', async () => {
    const ctx = new Map<string, ContextEntry>([
      [
        'e1',
        {
          id: 'e1',
          title: 'Beach day',
          body: 'Salt and sun.',
          mood: 'good',
          tags: ['summer'],
          created_at: '2026-09-01',
        },
      ],
    ])
    const tools = buildTools(fakeClient([{ id: 'e1', title: CIPHER, body: CIPHER, encrypted: true }]), owned, ctx)
    const listed = (await tools[0].run({ notebook_id: 'nb-1', limit: 8 })) as Array<{ title: string }>
    expect(listed[0].title).toBe('Beach day')
    const read = (await tools[1].run({ entry_id: 'e1' })) as { body: string }
    expect(read.body).toBe('Salt and sun.')
  })
})
