import { createRoute, z } from '@hono/zod-openapi'
import {
  CreateEntrySchema,
  EntrySchema,
  MoodSchema,
  PageQuerySchema,
  PaginatedSchema,
  TimestampSchema,
  UpdateEntrySchema,
  UuidSchema,
} from '../schemas'
import { Errors, fromPostgrestError } from '../errors'
import { requireAuth } from '../auth'
import { bearerAuth, errorResponses, jsonBody, type App } from './helpers'

const NotebookIdParam = z.object({
  notebookId: UuidSchema.openapi({ param: { name: 'notebookId', in: 'path' } }),
})

const EntryIdParam = z.object({
  id: UuidSchema.openapi({ param: { name: 'id', in: 'path' } }),
})

const EntryListQuery = z.object({
  ...PageQuerySchema.shape,
  mood: MoodSchema.optional().openapi({ description: 'Filter entries by mood' }),
})

/** Mood union as stored/returned by PostgREST. */
type Mood = 'great' | 'good' | 'okay' | 'low' | 'rough'

/** Row shape returned by PostgREST for entries. */
interface EntryRow {
  id: string
  notebook_id: string
  author_id: string
  title: string
  body: string
  mood: Mood | null
  tags: string[]
  is_shared: boolean
  encrypted: boolean
  created_at: string
  updated_at: string
}

export function registerEntryRoutes(app: App) {
  // ----------------------------------------------------------------- list by notebook
  const listByNotebook = createRoute({
    method: 'get',
    path: '/notebooks/{notebookId}/entries',
    tags: ['Entries'],
    summary: 'List entries in a notebook',
    description:
      'Paginated, newest first. You see: all entries in notebooks you own, and only is_shared entries in notebooks shared with you through group membership — enforced by the entries RLS policy.',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: NotebookIdParam, query: EntryListQuery },
    responses: {
      ...errorResponses(401, 422, 503),
      200: { description: 'Entries page', content: { 'application/json': { schema: PaginatedSchema(EntrySchema) } } },
    },
  })
  app.openapi(listByNotebook, async (c) => {
    const { notebookId } = c.req.valid('param')
    const { page, limit, mood } = c.req.valid('query')
    const from = (page - 1) * limit

    let query = c.var.userClient
      .from('entries')
      // Planned (EXPLAIN estimate) instead of exact: this endpoint is polled
      // every 60s under the SSE stream and every list page fetches it, and an
      // exact count is a separate full scan per request. The estimate drives
      // only "is there a next page", which it answers accurately enough.
      .select('*, entry_key_wraps(scope, wrapped_key)', { count: 'planned' })
      .eq('notebook_id', notebookId)
      .order('created_at', { ascending: false })
    if (mood) query = query.eq('mood', mood)

    const { data, count, error } = await query.range(from, from + limit - 1)
    if (error) throw fromPostgrestError(error)

    // RLS filters embedded wraps per scope already (author rows only for the
    // author, group rows only for group members) — relay what came back.
    const rows = (
      (data ?? []) as Array<EntryRow & { entry_key_wraps?: Array<{ scope: 'author' | 'group'; wrapped_key: string }> }>
    ).map((r) => {
      const { entry_key_wraps, ...rest } = r
      return { ...rest, key_wraps: entry_key_wraps ?? [] }
    })

    return c.json({
      data: rows,
      pagination: { page, limit, total: count ?? 0 },
    })
  })

  // ----------------------------------------------------------------- create
  const create = createRoute({
    method: 'post',
    path: '/notebooks/{notebookId}/entries',
    tags: ['Entries'],
    summary: 'Create a markdown entry',
    description:
      'Entries are authored only in your OWN notebooks (no co-editing in MVP). is_shared defaults to true — meaning the entry participates in group sharing once the notebook is linked to a group.',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: NotebookIdParam, body: jsonBody(CreateEntrySchema) },
    responses: {
      ...errorResponses(400, 401, 403, 404, 422, 503),
      201: { description: 'Entry created', content: { 'application/json': { schema: EntrySchema } } },
    },
  })
  app.openapi(create, async (c) => {
    const { notebookId } = c.req.valid('param')
    const { title, body, mood, tags, is_shared, encrypted, key_wraps } = c.req.valid('json')
    const user = c.var.user

    // Friendly 404 when the notebook is not visible at all.
    const { data: notebook, error: nbError } = await c.var.userClient
      .from('notebooks')
      .select('id, owner_id')
      .eq('id', notebookId)
      .maybeSingle()
    if (nbError) throw fromPostgrestError(nbError)
    if (!notebook) throw Errors.notFound('Notebook not found (or not visible to you)')
    if (notebook.owner_id !== user.id) {
      throw Errors.forbidden('Entries can only be created in notebooks you own')
    }

    const { data, error } = await c.var.userClient
      .from('entries')
      .insert({
        notebook_id: notebookId,
        author_id: user.id,
        title,
        body,
        mood: mood ?? null,
        tags: tags ?? [],
        is_shared: is_shared ?? true,
        encrypted: encrypted ?? false,
      })
      .select('*')
      .single()
    if (error) throw fromPostgrestError(error)
    if (!data) throw Errors.badRequest('Failed to create entry')

    const row = data as unknown as EntryRow

    // Content-key wraps ride along with the sealed payload (author scope
    // always; group scope when the notebook is group-linked and shared).
    if (key_wraps?.length) {
      const { error: wrapErr } = await c.var.userClient
        .from('entry_key_wraps')
        .insert(key_wraps.map((w) => ({ entry_id: row.id, scope: w.scope, wrapped_key: w.wrapped_key })))
      // A wrap write failure must not strand the entry: the body is sealed
      // but its key exists only client-side — surface it loudly.
      if (wrapErr) throw fromPostgrestError(wrapErr)
    }

    return c.json(row, 201)
  })

  // ----------------------------------------------------------------- get
  const getOne = createRoute({
    method: 'get',
    path: '/entries/{id}',
    tags: ['Entries'],
    summary: "Get one entry (records the reader's view)",
    description:
      'Subject to the visibility rule: authors and notebook owners always see it; group members see it only when is_shared is true. Opening it as a non-author records a read receipt in entry_views, and the response embeds who else has opened it. For encrypted entries the response embeds the entry\u2019s key wraps (author scope for the author; group scope for group-linked notebooks).',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: EntryIdParam },
    responses: {
      ...errorResponses(401, 404, 503),
      200: {
        description: 'Entry with readers',
        content: {
          'application/json': {
            schema: EntrySchema.extend({
              readers: z
                .array(
                  z.object({
                    user_id: UuidSchema,
                    display_name: z.string().nullable(),
                    viewed_at: TimestampSchema,
                  }),
                )
                .openapi({ description: 'Others who opened this entry, oldest view first' }),
              key_wraps: z
                .array(
                  z.object({
                    scope: z.enum(['author', 'group']),
                    wrapped_key: z.string(),
                  }),
                )
                .openapi({
                  description:
                    'Content-key wraps visible to you: author scope for the author, group scope for group members',
                }),
            }),
          },
        },
      },
    },
  })
  app.openapi(getOne, async (c) => {
    const { id } = c.req.valid('param')

    const { data, error } = await c.var.userClient.from('entries').select('*').eq('id', id).maybeSingle()
    if (error) throw fromPostgrestError(error)
    if (!data) throw Errors.notFound('Entry not found (or not visible to you)')

    const row = data as unknown as EntryRow

    // Read receipt: the author re-reading their own entry is not a "view".
    // Idempotent upsert — re-opens only bump viewed_at. Best effort: a failed
    // receipt must not fail the read itself.
    if (row.author_id !== c.var.user.id) {
      const up = await c.var.userClient
        .from('entry_views')
        .upsert({ entry_id: id, user_id: c.var.user.id }, { onConflict: 'entry_id,user_id' })
      void up.error
    }

    // Who has opened it (readable only while the entry is visible — RLS).
    let readers: Array<{ user_id: string; display_name: string | null; viewed_at: string }> = []
    const { data: viewRows, error: viewError } = await c.var.userClient
      .from('entry_views')
      .select('user_id, viewed_at, profiles(display_name)')
      .eq('entry_id', id)
      .neq('user_id', c.var.user.id)
      .order('viewed_at', { ascending: true })
      .limit(50)
    if (!viewError) {
      readers = (
        (viewRows ?? []) as Array<{
          user_id: string
          viewed_at: string
          profiles?: { display_name: string | null } | Array<{ display_name: string | null }> | null
        }>
      ).map((v) => ({
        user_id: v.user_id,
        display_name: (Array.isArray(v.profiles) ? v.profiles[0] : v.profiles)?.display_name ?? null,
        viewed_at: v.viewed_at,
      }))
    }

    // Key wraps for encrypted entries: the author path reads the author
    // scope, group members read the group scope — RLS enforces per scope.
    let keyWraps: Array<{ scope: 'author' | 'group'; wrapped_key: string }> = []
    const { data: wrapRows, error: wrapErr } = await c.var.userClient
      .from('entry_key_wraps')
      .select('scope, wrapped_key')
      .eq('entry_id', id)
    if (!wrapErr) {
      keyWraps = ((wrapRows ?? []) as Array<{ scope: 'author' | 'group'; wrapped_key: string }>).filter(
        (w) => row.author_id === c.var.user.id || w.scope === 'group',
      )
    }

    return c.json({ ...row, readers, key_wraps: keyWraps })
  })

  // ----------------------------------------------------------------- update
  const update = createRoute({
    method: 'patch',
    path: '/entries/{id}',
    tags: ['Entries'],
    summary: 'Edit an entry / toggle sharing',
    description:
      'Only the author can edit. Toggling is_shared opts the entry in/out of the notebook-level group sharing; group members see changes live.',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: EntryIdParam, body: jsonBody(UpdateEntrySchema) },
    responses: {
      ...errorResponses(400, 401, 403, 404, 422, 503),
      200: { description: 'Updated entry', content: { 'application/json': { schema: EntrySchema } } },
    },
  })
  app.openapi(update, async (c) => {
    const { id } = c.req.valid('param')
    const patchInput = c.req.valid('json')
    const user = c.var.user

    const { data: before, error: beforeErr } = await c.var.userClient
      .from('entries')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (beforeErr) throw fromPostgrestError(beforeErr)
    if (!before) throw Errors.notFound('Entry not found (or not visible to you)')
    if ((before as EntryRow).author_id !== user.id) throw Errors.forbidden('Only the author can edit an entry')

    const patch: Record<string, unknown> = {}
    if (patchInput.title !== undefined) patch.title = patchInput.title
    if (patchInput.body !== undefined) patch.body = patchInput.body
    if (patchInput.mood !== undefined) patch.mood = patchInput.mood
    if (patchInput.tags !== undefined) patch.tags = patchInput.tags
    if (patchInput.is_shared !== undefined) patch.is_shared = patchInput.is_shared
    if (patchInput.encrypted !== undefined) patch.encrypted = patchInput.encrypted

    const { data, error } = await c.var.userClient.from('entries').update(patch).eq('id', id).select('*').single()
    if (error) throw fromPostgrestError(error)
    if (!data) throw Errors.notFound('Entry not found')

    const row = data as unknown as EntryRow

    // Toggling sharing replaces the key wraps wholesale: un-sharing drops
    // the group scope; re-sharing re-adds it. RLS gates each write.
    if (patchInput.key_wraps !== undefined) {
      const { error: delErr } = await c.var.userClient.from('entry_key_wraps').delete().eq('entry_id', id)
      if (delErr) throw fromPostgrestError(delErr)
      if (patchInput.key_wraps.length > 0) {
        const { error: insErr } = await c.var.userClient
          .from('entry_key_wraps')
          .insert(patchInput.key_wraps.map((w) => ({ entry_id: id, scope: w.scope, wrapped_key: w.wrapped_key })))
        if (insErr) throw fromPostgrestError(insErr)
      }
    }

    return c.json(row)
  })

  // ----------------------------------------------------------------- delete
  const remove = createRoute({
    method: 'delete',
    path: '/entries/{id}',
    tags: ['Entries'],
    summary: 'Delete an entry',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: EntryIdParam },
    responses: {
      ...errorResponses(401, 403, 404, 503),
      204: { description: 'Entry deleted' },
    },
  })
  app.openapi(remove, async (c) => {
    const { id } = c.req.valid('param')
    const user = c.var.user

    const { data: before, error: beforeErr } = await c.var.userClient
      .from('entries')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (beforeErr) throw fromPostgrestError(beforeErr)
    if (!before) throw Errors.notFound('Entry not found (or not visible to you)')
    if ((before as EntryRow).author_id !== user.id) throw Errors.forbidden('Only the author can delete an entry')

    // The pre-read above narrows the window but does not close it: the row can
    // be deleted between the two statements. Reporting 204 for a delete that
    // matched nothing told the client it succeeded when it did not.
    const { data: deleted, error } = await c.var.userClient
      .from('entries')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle()
    if (error) throw fromPostgrestError(error)
    if (!deleted) throw Errors.notFound('Entry not found (or not visible to you)')

    return c.body(null, 204)
  })
}
