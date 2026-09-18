import { describe, expect, test } from 'bun:test'
import { QueryClient } from '@tanstack/react-query'
import { insertEntryIntoLists } from './hooks'
import type { Entry } from './types'

/**
 * An offline write lives only in the outbox, so the list it would have come
 * back from never refetches. It has to be spliced into the cache directly —
 * including when that list was never loaded this session, which is the case
 * that used to leave the write invisible until the next reconnect.
 */

function entry(over: Partial<Entry> & Pick<Entry, 'id'>): Entry {
  return {
    notebook_id: 'nb',
    author_id: 'me',
    title: 't',
    body: 'b',
    mood: null,
    tags: [],
    is_shared: false,
    encrypted: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

type List = { pages: Array<{ data: Entry[] }> }
const ids = (qc: QueryClient, key: unknown[]): string[] =>
  ((qc.getQueryData(key) as List | undefined)?.pages ?? []).flatMap((p) => p.data).map((e) => e.id)

describe('insertEntryIntoLists', () => {
  test('prepends into an existing unfiltered list', () => {
    const qc = new QueryClient()
    qc.setQueryData(['entries', 'nb', 'all'], { pages: [{ data: [entry({ id: 'old' })] }], pageParams: [1] })
    insertEntryIntoLists(qc, entry({ id: 'local_1' }))
    expect(ids(qc, ['entries', 'nb', 'all'])).toEqual(['local_1', 'old'])
  })

  test('seeds the unfiltered list when nothing is cached for the notebook', () => {
    const qc = new QueryClient()
    insertEntryIntoLists(qc, entry({ id: 'local_1' }))
    expect(ids(qc, ['entries', 'nb', 'all'])).toEqual(['local_1'])
  })

  test('touches every cached mood filter, and seeds nothing when one matched', () => {
    const qc = new QueryClient()
    qc.setQueryData(['entries', 'nb', 'happy'], { pages: [{ data: [entry({ id: 'old' })] }], pageParams: [1] })
    insertEntryIntoLists(qc, entry({ id: 'local_1' }))
    expect(ids(qc, ['entries', 'nb', 'happy'])).toEqual(['local_1', 'old'])
    expect(qc.getQueryData(['entries', 'nb', 'all'])).toBeUndefined()
  })

  test('an edit replaces in place and never duplicates', () => {
    const qc = new QueryClient()
    qc.setQueryData(['entries', 'nb', 'all'], {
      pages: [{ data: [entry({ id: 'local_1', title: 'before' })] }],
      pageParams: [1],
    })
    insertEntryIntoLists(qc, entry({ id: 'local_1', title: 'after' }))
    insertEntryIntoLists(qc, entry({ id: 'local_1', title: 'after' }))
    const list = (qc.getQueryData(['entries', 'nb', 'all']) as List).pages.flatMap((p) => p.data)
    expect(list.map((e) => e.id)).toEqual(['local_1'])
    expect(list[0].title).toBe('after')
  })

  test('a shared entry also lands in its group journal', () => {
    const qc = new QueryClient()
    qc.setQueryData(['notebooks'], { data: [{ id: 'nb', group_id: 'g1' }] })
    insertEntryIntoLists(qc, entry({ id: 'local_1', is_shared: true }))
    expect(ids(qc, ['group-entries', 'g1', '', '', '', '', '', ''])).toEqual(['local_1'])
    expect(ids(qc, ['entries', 'nb', 'all'])).toEqual(['local_1'])
  })

  test('a private entry never leaks into the group journal', () => {
    const qc = new QueryClient()
    qc.setQueryData(['notebooks'], { data: [{ id: 'nb', group_id: 'g1' }] })
    insertEntryIntoLists(qc, entry({ id: 'local_1', is_shared: false }))
    expect(qc.getQueryData(['group-entries', 'g1', '', '', '', '', '', ''])).toBeUndefined()
  })
})
