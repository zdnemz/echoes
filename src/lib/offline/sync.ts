'use client'

/**
 * Sync engine — replays the offline outbox when connectivity returns.
 *
 * Conflict policy (read-then-verify): the API has no version column, so before
 * replaying an offline *update* we re-read the entry and compare `updated_at`
 * to the base the client saw. If it moved — another device or a circle member
 * wrote since — the offline edit is NOT clobbered over theirs. The op stays
 * queued and surfaced, so a human decides. One extra GET per replayed edit is
 * cheap; a silent two-way data loss on someone's journal is not.
 */

import type { QueryClient } from '@tanstack/react-query'
import * as api from '@/lib/api/endpoints'
import { ApiError } from '@/lib/api/client'
import type { CreateEntryInput, UpdateEntryInput } from '@/lib/api/types'
import {
  type OutboxOp,
  listOps,
  removeOp,
  updateOp,
  resolveId,
  rememberIdMap,
  isLocalId,
  OUTBOX_MAX_ATTEMPTS,
} from './outbox'

let flushing = false

export function isFlushing(): boolean {
  return flushing
}

/**
 * Replay every replayable op in order. Runs to completion even if one op fails:
 * a single bad entry must not strand every write behind it.
 */
export async function flushOutbox(qc: QueryClient): Promise<void> {
  if (flushing) return
  flushing = true
  try {
    const ops = await listOps()
    for (const op of ops) {
      if (op.attempts >= OUTBOX_MAX_ATTEMPTS) continue
      if (op.status === 'syncing') continue
      await updateOp(op.id, { status: 'syncing' })
      try {
        await replayOp(op, qc)
        await removeOp(op.id)
      } catch (err) {
        const attempts = op.attempts + 1
        await updateOp(op.id, {
          status: 'failed',
          attempts,
          lastError: reason(err),
        })
        // An auth/config problem will fail every op identically — stop burning
        // the retry budget on a condition replay can't fix.
        if (isFatal(err)) return
      }
    }
  } finally {
    flushing = false
  }
}

async function replayOp(op: OutboxOp, qc: QueryClient): Promise<void> {
  const serverEntryId = await resolveId(op.entryId ?? '')

  if (op.kind === 'create-entry') {
    const created = await api.createEntry(op.notebookId as string, op.payload as unknown as CreateEntryInput)
    // Future queued edits/deletes of this offline-created entry must reach the
    // real row, not the local placeholder id.
    if (isLocalId(op.entryId)) {
      await rememberIdMap(op.entryId as string, created.id)
      qc.removeQueries({ queryKey: ['entry', op.entryId] })
    }
    qc.invalidateQueries({ queryKey: ['entries', created.notebook_id] })
    qc.invalidateQueries({ queryKey: ['group-entries'] })
    qc.invalidateQueries({ queryKey: ['notebooks'] })
    return
  }

  if (op.kind === 'update-entry') {
    if (serverEntryId) {
      // Staleness guard — see the module note.
      if (op.baseUpdatedAt) {
        const current = await api.getEntry(serverEntryId)
        if (current.updated_at !== op.baseUpdatedAt) {
          throw new ApiError(409, 'CONFLICT', 'This entry changed on another device since you last saw it.')
        }
      }
      await api.updateEntry(serverEntryId, op.payload as UpdateEntryInput)
    }
    qc.invalidateQueries({ queryKey: ['entry', serverEntryId] })
    qc.invalidateQueries({ queryKey: ['entries'] })
    qc.invalidateQueries({ queryKey: ['group-entries'] })
    qc.invalidateQueries({ queryKey: ['search'] })
    return
  }

  if (op.kind === 'delete-entry') {
    if (serverEntryId && !isLocalId(serverEntryId)) {
      // A 404 here means the entry is already gone — the delete succeeded
      // through another path, so treat it as done rather than failing.
      try {
        await api.deleteEntry(serverEntryId)
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return
        throw err
      }
    }
    qc.invalidateQueries({ queryKey: ['entries'] })
    qc.invalidateQueries({ queryKey: ['group-entries'] })
    qc.invalidateQueries({ queryKey: ['notebooks'] })
  }
}

/** Auth/unconfigured failures can't be fixed by retrying — stop the loop. */
function isFatal(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false
  return err.status === 401 || err.code === 'UNAUTHORIZED' || err.code === 'SUPABASE_NOT_CONFIGURED'
}

function reason(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'CONFLICT') return 'changed on another device'
    if (err.status === 0) return 'no connection'
    return err.message
  }
  return err instanceof Error ? err.message : 'sync failed'
}
