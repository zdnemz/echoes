import { z } from '@hono/zod-openapi'
import { UuidSchema } from '../schemas'
import { requireAuth } from '../auth'
import { fromPostgrestError } from '../errors'
import { requireGroupVisible, type App } from './helpers'
import { sendSeenWebhookThrottled } from '../webhook'

/**
 * Group realtime — Server-Sent Events push, no extra infrastructure.
 *
 * Why SSE and not Supabase Realtime: this deployment has no Realtime server
 * (local stack is Postgres + GoTrue + PostgREST; managed Supabase would need
 * the client pointed at it) and adding tables + a websocket service for
 * sub-second delivery is disproportionate for small circles. The stream polls
 * the already-RLS-filtered journal version every 2s server-side and pushes
 * only on change, so every open tab learns about a new message in ~2s with
 * one shared tick instead of every client refetching full pages.
 *
 * Typing + seen are ephemeral in-memory TTL maps, not rows: they are UI
 * signals, not data worth migrating. ponytail: single-instance ceiling —
 * sticky sessions or a shared store (Redis) if this ever runs multi-instance.
 */

const TICK_MS = 2000
const TYPING_TTL_MS = 6000

interface TypingMark {
  name: string
  exp: number
}

interface SeenMark {
  entryId: string
  at: number
}

// groupId -> userId -> mark
const typing = new Map<string, Map<string, TypingMark>>()
const seen = new Map<string, Map<string, SeenMark>>()

function groupMarks<T>(store: Map<string, Map<string, T>>, groupId: string): Map<string, T> {
  let m = store.get(groupId)
  if (!m) {
    m = new Map()
    store.set(groupId, m)
  }
  return m
}

function presenceSnapshot(groupId: string, now: number) {
  const t = groupMarks(typing, groupId)
  for (const [uid, mark] of t) if (mark.exp <= now) t.delete(uid)
  return {
    typing: [...t.entries()].map(([user_id, mark]) => ({ user_id, name: mark.name })),
    seen: [...groupMarks(seen, groupId).entries()].map(([user_id, mark]) => ({
      user_id,
      entry_id: mark.entryId,
      at: mark.at,
    })),
  }
}

function presenceKey(snapshot: unknown): string {
  return JSON.stringify(snapshot)
}

/** Count + latest update of the entries this caller may see in the group. */
async function journalVersion(userClient: Parameters<typeof requireGroupVisible>[0], groupId: string) {
  const [entriesRes, viewsRes] = await Promise.all([
    userClient
      .from('entries')
      .select('updated_at, notebooks!inner(group_id)', { count: 'exact' })
      .eq('notebooks.group_id', groupId)
      .order('updated_at', { ascending: false })
      .limit(1),
    // Read receipts belong to the journal's live layer: a new view should
    // re-tick the stream exactly like a new message does. Best effort — if
    // entry_views is missing (pre-0011 database) the version still works.
    userClient
      .from('entry_views')
      .select('viewed_at', { count: 'exact', head: true })
      .order('viewed_at', { ascending: false })
      .limit(1)
      .then(undefined, () => null),
  ])
  if (entriesRes.error) throw fromPostgrestError(entriesRes.error)
  const rows = (entriesRes.data ?? []) as Array<{ updated_at: string }>
  const lastView = (viewsRes?.data?.[0] as { viewed_at?: string } | undefined)?.viewed_at ?? 'none'
  return `${entriesRes.count ?? 0}:${rows[0]?.updated_at ?? 'none'}:views=${viewsRes?.count ?? 0}@${lastView}`
}

/** Member count + latest joined timestamp + pending join requests count. */
async function membersVersion(userClient: Parameters<typeof requireGroupVisible>[0], groupId: string) {
  const [{ count: memberCount, data: latestMember, error: memberErr }, { count: pendingCount }] = await Promise.all([
    userClient
      .from('group_members')
      .select('joined_at', { count: 'exact' })
      .eq('group_id', groupId)
      .order('joined_at', { ascending: false })
      .limit(1),
    userClient
      .from('group_join_requests')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', groupId)
      .eq('status', 'pending'),
  ])
  if (memberErr) throw fromPostgrestError(memberErr)
  const rows = (latestMember ?? []) as Array<{ joined_at: string }>
  return `${memberCount ?? 0}:${rows[0]?.joined_at ?? 'none'}:req=${pendingCount ?? 0}`
}

const TypingBody = z.object({ typing: z.boolean(), name: z.string().trim().max(80).optional() }).strict()
const SeenBody = z.object({ entry_id: UuidSchema }).strict()

export function registerRealtimeRoutes(app: App) {
  // ---------------------------------------------------------- event stream
  // Plain route (not OpenAPI): the body is text/event-stream, not JSON.
  app.get('/groups/:id/stream', requireAuth, async (c) => {
    const parsed = UuidSchema.safeParse(c.req.param('id'))
    if (!parsed.success) return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid group id' } }, 400)

    const groupId = parsed.data
    await requireGroupVisible(c.var.userClient, groupId, 'id')
    const me = c.var.user.id
    const signal = c.req.raw.signal

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder()
        const send = (event: string, data: unknown) =>
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        const closed = () => signal.aborted
        const close = () => {
          try {
            controller.close()
          } catch {
            // already closed by the runtime
          }
        }
        signal.addEventListener('abort', close)

        let lastVersion: string | null = null
        let lastMembersVersion: string | null = null
        let lastPresence = ''
        // Bound the connection so a forgotten tab cannot hold it forever;
        // the client reconnects with backoff.
        const deadline = Date.now() + 10 * 60_000
        send('hello', { tick_ms: TICK_MS })

        while (!closed() && Date.now() < deadline) {
          try {
            const [version, mVersion, presence] = await Promise.all([
              journalVersion(c.var.userClient, groupId),
              membersVersion(c.var.userClient, groupId),
              Promise.resolve(presenceSnapshot(groupId, Date.now())),
            ])
            if (version !== lastVersion) {
              lastVersion = version
              send('entries', { version })
            }
            if (mVersion !== lastMembersVersion) {
              lastMembersVersion = mVersion
              send('members', { version: mVersion })
            }
            const key = presenceKey(presence)
            if (key !== lastPresence) {
              lastPresence = key
              // Never echo the caller's own typing flag back at them.
              send('presence', {
                typing: presence.typing.filter((t) => t.user_id !== me),
                seen: presence.seen.filter((s) => s.user_id !== me),
              })
            }
          } catch {
            // Transient DB hiccup — keep the stream alive; the client also
            // refetches on reconnect, so nothing is lost.
          }
          await new Promise((r) => setTimeout(r, TICK_MS))
        }
        // Tell the client to reconnect immediately instead of waiting out
        // its backoff after our deliberate close.
        if (!closed()) send('retry-now', {})
        close()
      },
    })

    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      },
    })
  })

  // ---------------------------------------------------------- typing signal
  app.post('/groups/:id/typing', requireAuth, async (c) => {
    const parsed = UuidSchema.safeParse(c.req.param('id'))
    if (!parsed.success) return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid group id' } }, 400)
    const body = TypingBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid body' } }, 422)

    const groupId = parsed.data
    await requireGroupVisible(c.var.userClient, groupId, 'id')
    const marks = groupMarks(typing, groupId)
    if (body.data.typing)
      marks.set(c.var.user.id, { name: body.data.name || 'Someone', exp: Date.now() + TYPING_TTL_MS })
    else marks.delete(c.var.user.id)
    return c.json({ ok: true })
  })

  // ---------------------------------------------------------- seen receipt
  app.post('/groups/:id/seen', requireAuth, async (c) => {
    const parsed = UuidSchema.safeParse(c.req.param('id'))
    if (!parsed.success) return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid group id' } }, 400)
    const body = SeenBody.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid body' } }, 422)

    const groupId = parsed.data
    await requireGroupVisible(c.var.userClient, groupId, 'id')
    groupMarks(seen, groupId).set(c.var.user.id, { entryId: body.data.entry_id, at: Date.now() })
    sendSeenWebhookThrottled(groupId, c.var.user)
    return c.json({ ok: true })
  })
}
