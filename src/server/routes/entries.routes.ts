import { createRoute, z } from '@hono/zod-openapi'
import {
  CreateEntrySchema,
  EntrySchema,
  MoodSchema,
  PageQuerySchema,
  PaginatedSchema,
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
      .select('*', { count: 'exact' })
      .eq('notebook_id', notebookId)
      .order('created_at', { ascending: false })
    if (mood) query = query.eq('mood', mood)

    const { data, count, error } = await query.range(from, from + limit - 1)
    if (error) throw fromPostgrestError(error)

    return c.json({
      data: data ?? [],
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
    const { title, body, mood, tags, is_shared } = c.req.valid('json')
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
      })
      .select('*')
      .single()
    if (error) throw fromPostgrestError(error)
    if (!data) throw Errors.badRequest('Failed to create entry')

    const row = data as unknown as EntryRow

    return c.json(row, 201)
  })

  // ----------------------------------------------------------------- get
  const getOne = createRoute({
    method: 'get',
    path: '/entries/{id}',
    tags: ['Entries'],
    summary: 'Get one entry',
    description:
      'Subject to the visibility rule: authors and notebook owners always see it; group members see it only when is_shared is true.',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: EntryIdParam },
    responses: {
      ...errorResponses(401, 404, 503),
      200: { description: 'Entry', content: { 'application/json': { schema: EntrySchema } } },
    },
  })
  app.openapi(getOne, async (c) => {
    const { id } = c.req.valid('param')

    const { data, error } = await c.var.userClient.from('entries').select('*').eq('id', id).maybeSingle()
    if (error) throw fromPostgrestError(error)
    if (!data) throw Errors.notFound('Entry not found (or not visible to you)')

    return c.json(data as unknown as EntryRow)
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

    const { data, error } = await c.var.userClient.from('entries').update(patch).eq('id', id).select('*').single()
    if (error) throw fromPostgrestError(error)
    if (!data) throw Errors.notFound('Entry not found')

    const row = data as unknown as EntryRow

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

    const { error } = await c.var.userClient.from('entries').delete().eq('id', id)
    if (error) throw fromPostgrestError(error)

    return c.body(null, 204)
  })
}
