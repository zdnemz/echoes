import { createRoute, z } from '@hono/zod-openapi'
import {
  CreateNotebookSchema,
  NotebookSchema,
  PageQuerySchema,
  PaginatedSchema,
  UpdateNotebookSchema,
  UuidSchema,
} from '../schemas'
import { Errors, fromPostgrestError } from '../errors'
import { requireAuth } from '../auth'
import { bearerAuth, errorResponses, jsonBody, requireGroupVisible, type App } from './helpers'

const NotebookIdParam = z.object({
  id: UuidSchema.openapi({ param: { name: 'id', in: 'path' } }),
})

export function registerNotebookRoutes(app: App) {
  // ----------------------------------------------------------------- list
  const list = createRoute({
    method: 'get',
    path: '/notebooks',
    tags: ['Notebooks'],
    summary: 'List notebooks you own plus notebooks shared with you',
    description:
      'Returns notebooks where you are the owner, plus notebooks linked to any group you belong to. Enforced by the notebooks RLS policy — a notebook appears here exactly when the visibility rule allows you to see it.',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { query: PageQuerySchema },
    responses: {
      ...errorResponses(401, 503),
      200: {
        description: 'Your visible notebooks',
        content: { 'application/json': { schema: PaginatedSchema(NotebookSchema) } },
      },
    },
  })
  app.openapi(list, async (c) => {
    const { page, limit } = c.req.valid('query') as { page: number; limit: number }
    const from = (page - 1) * limit

    const { data, count, error } = await c.var.userClient
      .from('notebooks')
      .select('*', { count: 'exact' })
      .order('updated_at', { ascending: false })
      .range(from, from + limit - 1)
    if (error) throw fromPostgrestError(error)

    return c.json({
      data: data ?? [],
      pagination: { page, limit, total: count ?? 0 },
    })
  })

  // ----------------------------------------------------------------- create
  const create = createRoute({
    method: 'post',
    path: '/notebooks',
    tags: ['Notebooks'],
    summary: 'Create a notebook',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { body: jsonBody(CreateNotebookSchema) },
    responses: {
      ...errorResponses(400, 401, 403, 422, 503),
      201: { description: 'Notebook created', content: { 'application/json': { schema: NotebookSchema } } },
    },
  })
  app.openapi(create, async (c) => {
    const { title } = c.req.valid('json')
    const user = c.var.user

    const { data, error } = await c.var.userClient
      .from('notebooks')
      .insert({ owner_id: user.id, title })
      .select('*')
      .single()
    if (error) throw fromPostgrestError(error)
    if (!data) throw Errors.badRequest('Failed to create notebook')

    return c.json(data, 201)
  })

  // ----------------------------------------------------------------- get
  const getOne = createRoute({
    method: 'get',
    path: '/notebooks/{id}',
    tags: ['Notebooks'],
    summary: 'Get one notebook',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: NotebookIdParam },
    responses: {
      ...errorResponses(401, 404, 503),
      200: { description: 'Notebook', content: { 'application/json': { schema: NotebookSchema } } },
    },
  })
  app.openapi(getOne, async (c) => {
    const { id } = c.req.valid('param')

    const { data, error } = await c.var.userClient.from('notebooks').select('*').eq('id', id).maybeSingle()
    if (error) throw fromPostgrestError(error)
    if (!data) throw Errors.notFound('Notebook not found (or not visible to you)')

    return c.json(data)
  })

  // ----------------------------------------------------------------- update
  const update = createRoute({
    method: 'patch',
    path: '/notebooks/{id}',
    tags: ['Notebooks'],
    summary: 'Rename, link to a group, or unlink',
    description:
      'Only the notebook owner may update it. Setting group_id links the notebook to a group you belong to (at most one group per notebook); null unlinks it, immediately revoking visibility for the group.',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: {
      params: NotebookIdParam,
      body: jsonBody(UpdateNotebookSchema),
    },
    responses: {
      ...errorResponses(400, 401, 403, 404, 422, 503),
      200: { description: 'Updated notebook', content: { 'application/json': { schema: NotebookSchema } } },
    },
  })
  app.openapi(update, async (c) => {
    const { id } = c.req.valid('param')
    const { title, group_id } = c.req.valid('json')

    // Fetch current state first (for a friendly 404).
    const { data: before, error: beforeErr } = await c.var.userClient
      .from('notebooks')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (beforeErr) throw fromPostgrestError(beforeErr)
    if (!before) throw Errors.notFound('Notebook not found (or not visible to you)')

    if (before.owner_id !== c.var.user.id) {
      throw Errors.forbidden('Only the notebook owner can update it')
    }

    const patch: Record<string, unknown> = {}
    if (title !== undefined) patch.title = title
    if (group_id !== undefined) {
      if (group_id !== null) await requireGroupVisible(c.var.userClient, group_id)
      patch.group_id = group_id
    }

    const { data, error } = await c.var.userClient.from('notebooks').update(patch).eq('id', id).select('*').single()
    if (error) throw fromPostgrestError(error)
    if (!data) throw Errors.notFound('Notebook not found')

    return c.json(data)
  })

  // ----------------------------------------------------------------- delete
  const remove = createRoute({
    method: 'delete',
    path: '/notebooks/{id}',
    tags: ['Notebooks'],
    summary: 'Delete a notebook and all its entries',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: NotebookIdParam },
    responses: {
      ...errorResponses(401, 403, 404, 503),
      204: { description: 'Notebook deleted' },
    },
  })
  app.openapi(remove, async (c) => {
    const { id } = c.req.valid('param')

    const { data: before, error: beforeErr } = await c.var.userClient
      .from('notebooks')
      .select('id, owner_id, group_id, title')
      .eq('id', id)
      .maybeSingle()
    if (beforeErr) throw fromPostgrestError(beforeErr)
    if (!before) throw Errors.notFound('Notebook not found (or not visible to you)')
    if (before.owner_id !== c.var.user.id) throw Errors.forbidden('Only the notebook owner can delete it')

    // Same TOCTOU as entry deletion: a delete matching zero rows is not a
    // success, so do not report 204.
    const { data: deleted, error } = await c.var.userClient
      .from('notebooks')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle()
    if (error) throw fromPostgrestError(error)
    if (!deleted) throw Errors.notFound('Notebook not found (or not visible to you)')

    return c.body(null, 204)
  })
}
