import { describe, expect, test } from 'bun:test'
import { planCoalesce, isLocalId, type OutboxOp } from './outbox'

/**
 * The outbox coalescing rules are the difference between a queue that replays
 * one clean write per entry and one that replays three stale ones — the
 * latter would make the sync staleness guard false-positive and silently
 * strand the user's edits. Pure logic only: no IndexedDB in these tests.
 */

function mk(op: Partial<OutboxOp>): OutboxOp {
  return {
    id: 'op-1',
    kind: 'update-entry',
    entryId: 'entry-1',
    payload: {},
    createdAt: 0,
    status: 'pending',
    attempts: 0,
    ...op,
  }
}

describe('outbox coalescing', () => {
  test('a second update replaces the first, keeping the earliest base', () => {
    const queued = mk({ id: 'q1', kind: 'update-entry', payload: { v: 1 }, baseUpdatedAt: 't0' })
    const plan = planCoalesce({ kind: 'update-entry', entryId: 'entry-1', payload: { v: 2 }, baseUpdatedAt: 't0' }, [
      queued,
    ])
    expect(plan.deleteIds).toEqual([])
    expect(plan.put?.id).toBe('q1')
    expect(plan.put?.payload).toEqual({ v: 2 })
    expect(plan.put?.baseUpdatedAt).toBe('t0')
  })

  test('a first-time write is added, not merged', () => {
    const plan = planCoalesce({ kind: 'update-entry', entryId: 'entry-1', payload: { v: 1 } }, [])
    expect(plan.put).toBeDefined()
    expect(plan.put?.id).not.toBe('')
    expect(plan.deleteIds).toEqual([])
  })

  test('a delete discards pending updates to the same server entry', () => {
    const edits = [
      mk({ id: 'q1', kind: 'update-entry', entryId: 'entry-1', payload: { v: 1 } }),
      mk({ id: 'q2', kind: 'update-entry', entryId: 'entry-1', payload: { v: 2 } }),
    ]
    const plan = planCoalesce({ kind: 'delete-entry', entryId: 'entry-1', payload: {} }, edits)
    expect(plan.deleteIds).toEqual(['q1', 'q2'])
    expect(plan.put?.kind).toBe('delete-entry')
  })

  test('deleting an offline-created entry drops its queued create and queues nothing', () => {
    const localId = 'local_abc'
    const create = mk({ id: 'q1', kind: 'create-entry', entryId: localId, payload: {} })
    const plan = planCoalesce({ kind: 'delete-entry', entryId: localId, payload: {} }, [create])
    expect(plan.deleteIds).toEqual(['q1'])
    expect(plan.put).toBeUndefined()
  })

  test('a queued delete absorbs a later delete', () => {
    const queued = mk({ id: 'q1', kind: 'delete-entry', entryId: 'entry-1', payload: {} })
    const plan = planCoalesce({ kind: 'delete-entry', entryId: 'entry-1', payload: {} }, [queued])
    expect(plan.put?.id).toBe('q1')
    expect(plan.deleteIds).toEqual([])
  })

  test('ops on different entries never touch each other', () => {
    const other = mk({ id: 'q1', kind: 'update-entry', entryId: 'entry-2', payload: {} })
    const plan = planCoalesce({ kind: 'update-entry', entryId: 'entry-1', payload: {} }, [other])
    expect(plan.deleteIds).toEqual([])
    expect(plan.put?.entryId).toBe('entry-1')
  })

  test('isLocalId recognizes the offline placeholder prefix', () => {
    expect(isLocalId('local_abc')).toBe(true)
    expect(isLocalId('123e4567-e89b')).toBe(false)
    expect(isLocalId(undefined)).toBe(false)
    expect(isLocalId(null)).toBe(false)
  })
})
