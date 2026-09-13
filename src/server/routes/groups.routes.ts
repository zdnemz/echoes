import { createRoute, z } from '@hono/zod-openapi'
import {
  CreateGroupSchema,
  EntrySchema,
  GroupMemberSchema,
  GroupSchema,
  MoodSchema,
  PageQuerySchema,
  PaginatedSchema,
  TimestampSchema,
  UpdateGroupSchema,
  UuidSchema,
} from '../schemas'
import { escapePostgrestValue } from './search.routes'
import { Errors, fromPostgrestError } from '../errors'
import { requireAuth } from '../auth'
import { bearerAuth, errorResponses, jsonBody, type App } from './helpers'

const GroupIdParam = z.object({
  id: UuidSchema.openapi({ param: { name: 'id', in: 'path' } }),
})

const GroupMemberParam = z.object({
  id: UuidSchema.openapi({ param: { name: 'id', in: 'path' } }),
  userId: UuidSchema.openapi({ param: { name: 'userId', in: 'path' } }),
})

type Role = 'owner' | 'member'

interface GroupRow {
  id: string
  owner_id: string
  name: string
  created_at: string
  auto_accept: boolean
}

interface MemberRow {
  user_id: string
  role: string
  joined_at: string
  profiles?: { display_name: string | null } | Array<{ display_name: string | null }> | null
}

function toGroupView(group: GroupRow, members: MemberRow[], me: string) {
  const mine = members.find((m) => m.user_id === me)
  return {
    id: group.id,
    owner_id: group.owner_id,
    name: group.name,
    created_at: group.created_at,
    auto_accept: group.auto_accept ?? false,
    my_role: (mine?.role as Role) ?? 'member',
    member_count: members.length,
  }
}

function toMemberView(m: MemberRow) {
  const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
  return {
    user_id: m.user_id,
    email: null as string | null,
    display_name: profile?.display_name ?? null,
    role: m.role as Role,
    joined_at: m.joined_at,
  }
}

export function registerGroupRoutes(app: App) {
  // ----------------------------------------------------------------- list
  const list = createRoute({
    method: 'get',
    path: '/groups',
    tags: ['Groups'],
    summary: 'List groups you own or belong to',
    security: [bearerAuth],
    middleware: [requireAuth],
    responses: {
      ...errorResponses(401, 503),
      200: {
        description: 'Groups with your role and member counts',
        content: { 'application/json': { schema: z.array(GroupSchema) } },
      },
    },
  })
  app.openapi(list, async (c) => {
    const me = c.var.user.id

    const { data: groups, error } = await c.var.userClient
      .from('groups')
      .select('id, owner_id, name, created_at, auto_accept, group_members(role, user_id)')
      .order('created_at', { ascending: true })
    if (error) throw fromPostgrestError(error)

    const rows = (groups ?? []) as unknown as Array<GroupRow & { group_members?: MemberRow[] }>

    // Note: a group is only visible via RLS when you own it or belong to it.
    const visible = rows.filter((g) => g.owner_id === me || (g.group_members ?? []).some((m) => m.user_id === me))

    return c.json(
      visible.map((g) =>
        toGroupView(
          g,
          (g.group_members ?? []).map((m) => m as MemberRow),
          me,
        ),
      ),
    )
  })

  // ----------------------------------------------------------------- create
  const create = createRoute({
    method: 'post',
    path: '/groups',
    tags: ['Groups'],
    summary: 'Create a group (you become the owner)',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { body: jsonBody(CreateGroupSchema) },
    responses: {
      ...errorResponses(400, 401, 403, 422, 503),
      201: { description: 'Group created', content: { 'application/json': { schema: GroupSchema } } },
    },
  })
  app.openapi(create, async (c) => {
    const { name } = c.req.valid('json')
    const me = c.var.user.id

    const { data: group, error } = await c.var.userClient
      .from('groups')
      .insert({ owner_id: me, name })
      .select('id, owner_id, name, created_at, auto_accept')
      .single()
    if (error) throw fromPostgrestError(error)
    if (!group) throw Errors.badRequest('Failed to create group')

    // Register the creator as the owner member (RLS: self + group owner).
    // If this fails, remove the just-created group — otherwise it lingers
    // with no owner member and nobody able to see or delete it.
    const { error: memberError } = await c.var.userClient
      .from('group_members')
      .insert({ group_id: group.id, user_id: me, role: 'owner' })
    if (memberError) {
      await c.var.userClient.from('groups').delete().eq('id', group.id)
      throw fromPostgrestError(memberError)
    }

    return c.json(
      {
        id: group.id,
        owner_id: group.owner_id,
        name: group.name,
        created_at: group.created_at,
        auto_accept: (group as GroupRow).auto_accept ?? false,
        my_role: 'owner',
        member_count: 1,
      },
      201,
    )
  })

  // ----------------------------------------------------------------- get one
  const getOne = createRoute({
    method: 'get',
    path: '/groups/{id}',
    tags: ['Groups'],
    summary: 'Group details with members',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: GroupIdParam },
    responses: {
      ...errorResponses(401, 404, 503),
      200: {
        description: 'Group with member list',
        content: {
          'application/json': {
            schema: z.object({ ...GroupSchema.shape, members: z.array(GroupMemberSchema) }),
          },
        },
      },
    },
  })
  app.openapi(getOne, async (c) => {
    const { id } = c.req.valid('param')
    const me = c.var.user.id

    const { data, error } = await c.var.userClient
      .from('groups')
      .select(
        'id, owner_id, name, created_at, auto_accept, group_members(role, joined_at, user_id, profiles(display_name))',
      )
      .eq('id', id)
      .maybeSingle()
    if (error) throw fromPostgrestError(error)
    if (!data) throw Errors.notFound('Group not found (or not visible to you)')

    const row = data as unknown as GroupRow & { group_members?: MemberRow[] }
    const members = row.group_members ?? []
    const visibleToMe = row.owner_id === me || members.some((m) => m.user_id === me)
    if (!visibleToMe) throw Errors.notFound('Group not found (or not visible to you)')

    return c.json({
      ...toGroupView(row, members, me),
      members: members.map(toMemberView),
    })
  })

  // ----------------------------------------------------------------- update
  const update = createRoute({
    method: 'patch',
    path: '/groups/{id}',
    tags: ['Groups'],
    summary: 'Rename a group / flip auto-accept (owner only)',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: GroupIdParam, body: jsonBody(UpdateGroupSchema) },
    responses: {
      ...errorResponses(400, 401, 403, 404, 422, 503),
      200: { description: 'Updated group', content: { 'application/json': { schema: GroupSchema } } },
    },
  })
  app.openapi(update, async (c) => {
    const { id } = c.req.valid('param')
    const { name, auto_accept } = c.req.valid('json')

    const patch: Record<string, unknown> = {}
    if (name !== undefined) patch.name = name
    if (auto_accept !== undefined) patch.auto_accept = auto_accept

    const { data, error } = await c.var.userClient
      .from('groups')
      .update(patch)
      .eq('id', id)
      .select('id, owner_id, name, created_at, auto_accept')
      .maybeSingle()
    if (error) throw fromPostgrestError(error)
    if (!data) throw Errors.notFound('Group not found, or you are not its owner')

    const { data: members } = await c.var.userClient
      .from('group_members')
      .select('user_id, role, joined_at, profiles(display_name)')
      .eq('group_id', id)
    const rows = (members ?? []) as unknown as MemberRow[]

    return c.json({
      ...toGroupView(data as GroupRow, rows, c.var.user.id),
      members: rows.map(toMemberView),
    })
  })

  // ----------------------------------------------------------------- delete
  const remove = createRoute({
    method: 'delete',
    path: '/groups/{id}',
    tags: ['Groups'],
    summary: 'Delete a group (owner only)',
    description:
      'Deleting the group removes memberships and invites, and every notebook linked to it is automatically unlinked (sharing revoked immediately).',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: GroupIdParam },
    responses: {
      ...errorResponses(401, 403, 404, 503),
      204: { description: 'Group deleted' },
    },
  })
  app.openapi(remove, async (c) => {
    const { id } = c.req.valid('param')

    const { data, error } = await c.var.userClient.from('groups').delete().eq('id', id).select('id').maybeSingle()
    if (error) throw fromPostgrestError(error)
    if (!data) throw Errors.notFound('Group not found, or you are not its owner')

    return c.body(null, 204)
  })

  // ----------------------------------------------------------------- members
  const listMembers = createRoute({
    method: 'get',
    path: '/groups/{id}/members',
    tags: ['Groups'],
    summary: 'List members of a group you belong to',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: GroupIdParam },
    responses: {
      ...errorResponses(401, 404, 503),
      200: { description: 'Members', content: { 'application/json': { schema: z.array(GroupMemberSchema) } } },
    },
  })
  app.openapi(listMembers, async (c) => {
    const { id } = c.req.valid('param')

    const { data: group, error: groupErr } = await c.var.userClient
      .from('groups')
      .select('id, owner_id')
      .eq('id', id)
      .maybeSingle()
    if (groupErr) throw fromPostgrestError(groupErr)
    if (!group) throw Errors.notFound('Group not found (or not visible to you)')

    const { data: members, error } = await c.var.userClient
      .from('group_members')
      .select('user_id, role, joined_at, profiles(display_name)')
      .eq('group_id', id)
      .order('joined_at', { ascending: true })
    if (error) throw fromPostgrestError(error)

    const rows = (members ?? []) as unknown as MemberRow[]
    // Double-check visibility (RLS already filters, this is belt-and-braces).
    const isMember = group.owner_id === c.var.user.id || rows.some((m) => m.user_id === c.var.user.id)
    if (!isMember) throw Errors.notFound('Group not found (or not visible to you)')

    return c.json(rows.map(toMemberView))
  })

  // ----------------------------------------------------------------- remove member
  const removeMember = createRoute({
    method: 'delete',
    path: '/groups/{id}/members/{userId}',
    tags: ['Groups'],
    summary: 'Remove a member (owner) or yourself (leave)',
    description:
      'Group owners may remove any member; members may only remove themselves (equivalent to leaving). Removing membership immediately revokes visibility of that group’s notebooks.',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: GroupMemberParam },
    responses: {
      ...errorResponses(400, 401, 403, 404, 503),
      204: { description: 'Member removed' },
    },
  })
  app.openapi(removeMember, async (c) => {
    const { id, userId } = c.req.valid('param')
    const me = c.var.user.id

    if (userId !== me) {
      // Must be the group owner to remove someone else.
      const { data: group, error: groupErr } = await c.var.userClient
        .from('groups')
        .select('owner_id')
        .eq('id', id)
        .maybeSingle()
      if (groupErr) throw fromPostgrestError(groupErr)
      if (!group) throw Errors.notFound('Group not found (or not visible to you)')
      if (group.owner_id !== me) throw Errors.forbidden('Only the group owner can remove other members')

      // The owner cannot be removed — delete the group instead.
      if (group.owner_id === userId) {
        throw Errors.badRequest('The group owner cannot be removed; delete the group instead')
      }
    }

    const { data, error } = await c.var.userClient
      .from('group_members')
      .delete()
      .eq('group_id', id)
      .eq('user_id', userId)
      .select('user_id')
      .maybeSingle()
    if (error) throw fromPostgrestError(error)
    if (!data) throw Errors.notFound('Membership not found')

    return c.body(null, 204)
  })

  // ----------------------------------------------------------------- leave
  const leave = createRoute({
    method: 'post',
    path: '/groups/{id}/leave',
    tags: ['Groups'],
    summary: 'Leave a group',
    description: 'Any member can leave. Owners must delete the group instead (transfer is out of MVP scope).',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: GroupIdParam },
    responses: {
      ...errorResponses(400, 401, 403, 404, 503),
      204: { description: 'You left the group' },
    },
  })
  app.openapi(leave, async (c) => {
    const { id } = c.req.valid('param')
    const me = c.var.user.id

    const { data: group, error: groupErr } = await c.var.userClient
      .from('groups')
      .select('owner_id')
      .eq('id', id)
      .maybeSingle()
    if (groupErr) throw fromPostgrestError(groupErr)
    if (!group) throw Errors.notFound('Group not found (or not visible to you)')
    if (group.owner_id === me) {
      throw Errors.badRequest('Owners cannot leave their own group; delete it instead')
    }

    const { data, error } = await c.var.userClient
      .from('group_members')
      .delete()
      .eq('group_id', id)
      .eq('user_id', me)
      .select('user_id')
      .maybeSingle()
    if (error) throw fromPostgrestError(error)
    if (!data) throw Errors.notFound('You are not a member of this group')

    return c.body(null, 204)
  })

  // ----------------------------------------------------------------- group journal
  const journalQuery = z
    .object({
      ...PageQuerySchema.shape,
      author_id: UuidSchema.optional().openapi({ description: 'Only entries by this member' }),
      mood: MoodSchema.optional().openapi({ description: 'Filter entries by mood' }),
      tags: z.string().max(200).optional().openapi({
        example: 'morning,gratitude',
        description: 'Comma-separated tags — matches entries having any of them',
      }),
      q: z
        .string()
        .min(1)
        .max(200)
        .optional()
        .openapi({ example: 'coffee', description: 'Search term matched against title and body' }),
      since: TimestampSchema.optional().openapi({ description: 'Only entries created at or after this time' }),
      until: TimestampSchema.optional().openapi({ description: 'Only entries created at or before this time' }),
    })
    .strict()

  const journal = createRoute({
    method: 'get',
    path: '/groups/{id}/entries',
    tags: ['Groups'],
    summary: "The group's journal — shared entries across its notebooks",
    description:
      'One stream over every notebook linked to the group, newest first, filterable by author, time window, mood, tags and text. The entries RLS policy still decides row by row what you may see (private opt-outs stay invisible).',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: GroupIdParam, query: journalQuery },
    responses: {
      ...errorResponses(400, 401, 404, 422, 503),
      200: { description: 'Entries page', content: { 'application/json': { schema: PaginatedSchema(EntrySchema) } } },
    },
  })
  app.openapi(journal, async (c) => {
    const { id } = c.req.valid('param')
    const { page, limit, author_id, mood, tags, q, since, until } = c.req.valid('query')
    const from = (page - 1) * limit

    const sinceMs = since ? Date.parse(since) : NaN
    if (since && Number.isNaN(sinceMs)) throw Errors.badRequest('Invalid since timestamp')
    const untilMs = until ? Date.parse(until) : NaN
    if (until && Number.isNaN(untilMs)) throw Errors.badRequest('Invalid until timestamp')

    // Group visible at all? (RLS decides; missing row reads as 404.)
    const { data: group, error: groupErr } = await c.var.userClient
      .from('groups')
      .select('id')
      .eq('id', id)
      .maybeSingle()
    if (groupErr) throw fromPostgrestError(groupErr)
    if (!group) throw Errors.notFound('Group not found (or not visible to you)')

    // Notebooks linked here (RLS-filtered); empty link set → empty journal.
    const { data: notebooks, error: nbErr } = await c.var.userClient.from('notebooks').select('id').eq('group_id', id)
    if (nbErr) throw fromPostgrestError(nbErr)
    const ids = (notebooks ?? []).map((n) => (n as { id: string }).id)
    if (ids.length === 0) {
      return c.json({ data: [], pagination: { page, limit, total: 0 } })
    }

    const query = c.var.userClient.from('entries').select('*', { count: 'exact' }).in('notebook_id', ids)
    let filtered = query
    if (author_id) filtered = filtered.eq('author_id', author_id)
    if (mood) filtered = filtered.eq('mood', mood)
    const tagList = (tags ?? '')
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
    if (tagList.length > 0) filtered = filtered.overlaps('tags', tagList)
    if (q) {
      const likePattern = escapePostgrestValue(`%${q}%`)
      filtered = filtered.or(`title.ilike.${likePattern},body.ilike.${likePattern}`)
    }
    if (since) filtered = filtered.gte('created_at', new Date(sinceMs).toISOString())
    if (until) filtered = filtered.lte('created_at', new Date(untilMs).toISOString())

    const { data, count, error } = await filtered
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1)
    if (error) throw fromPostgrestError(error)

    return c.json({
      data: data ?? [],
      pagination: { page, limit, total: count ?? 0 },
    })
  })
}
