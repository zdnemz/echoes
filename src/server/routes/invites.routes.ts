import { randomBytes } from 'node:crypto'
import { createRoute, z } from '@hono/zod-openapi'
import { CreateInviteSchema, InviteInfoSchema, InviteSchema, UuidSchema } from '../schemas'
import { ApiError, Errors, fromPostgrestError } from '../errors'
import { requireAuth } from '../auth'
import { getServiceClient, adminFindUserByEmail } from '../supabase'
import { getMailer, inviteAcceptUrl } from '../mailer'
import { bearerAuth, errorResponses, jsonBody, requireServiceRoleConfig, type App } from './helpers'

const GroupIdParam = z.object({
  id: UuidSchema.openapi({ param: { name: 'id', in: 'path' } }),
})

const TokenParam = z.object({
  token: z
    .string()
    .min(16)
    .max(128)
    .openapi({ param: { name: 'token', in: 'path' } }),
})

interface InviteRow {
  id: string
  group_id: string
  email: string
  token: string
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  invited_by: string
  expires_at: string
  created_at: string
}

const DEFAULT_EXPIRY_HOURS = 48

export function registerInviteRoutes(app: App) {
  // ----------------------------------------------------------------- create
  const create = createRoute({
    method: 'post',
    path: '/groups/{id}/invites',
    tags: ['Invites'],
    summary: 'Invite someone by email (owner only)',
    description:
      'Creates a single-use, expiring invite token. The accept link is the invite itself. In this build the email is a dev-mode stub: the link is returned in the response and logged (see accept_url).',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: GroupIdParam, body: jsonBody(CreateInviteSchema) },
    responses: {
      ...errorResponses(400, 401, 403, 404, 422, 503),
      201: { description: 'Invite created', content: { 'application/json': { schema: InviteSchema } } },
    },
  })
  app.openapi(create, async (c) => {
    const { id } = c.req.valid('param')
    const { email, expires_in_hours } = c.req.valid('json')
    const me = c.var.user

    // Owner check — RLS enforces this too (group_invites: owner insert).
    const { data: group, error: groupErr } = await c.var.userClient
      .from('groups')
      .select('id, owner_id, name')
      .eq('id', id)
      .maybeSingle()
    if (groupErr) throw fromPostgrestError(groupErr)
    if (!group) throw Errors.notFound('Group not found (or not visible to you)')
    if (group.owner_id !== me.id) throw Errors.forbidden('Only the group owner can invite members')

    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + (expires_in_hours ?? DEFAULT_EXPIRY_HOURS) * 3600_000).toISOString()

    const { data: invite, error } = await c.var.userClient
      .from('group_invites')
      .insert({ group_id: id, email: email.toLowerCase(), token, invited_by: me.id, expires_at: expiresAt })
      .select('*')
      .single()
    if (error) throw fromPostgrestError(error)
    if (!invite) throw Errors.badRequest('Failed to create invite')

    const acceptUrl = inviteAcceptUrl(token)
    const { data: myProfile } = await c.var.userClient
      .from('profiles')
      .select('display_name')
      .eq('id', me.id)
      .maybeSingle()

    await getMailer().sendInviteEmail({
      to: email,
      groupName: group.name,
      inviterName: myProfile?.display_name ?? null,
      acceptUrl,
    })

    return c.json({ ...(invite as InviteRow), accept_url: acceptUrl }, 201)
  })

  // ----------------------------------------------------------------- list for group
  const listForGroup = createRoute({
    method: 'get',
    path: '/groups/{id}/invites',
    tags: ['Invites'],
    summary: 'List invites for a group (owner only)',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: GroupIdParam },
    responses: {
      ...errorResponses(401, 403, 404, 503),
      200: { description: 'Invites', content: { 'application/json': { schema: z.array(InviteSchema) } } },
    },
  })
  app.openapi(listForGroup, async (c) => {
    const { id } = c.req.valid('param')
    const me = c.var.user.id

    const { data: group, error: groupErr } = await c.var.userClient
      .from('groups')
      .select('owner_id')
      .eq('id', id)
      .maybeSingle()
    if (groupErr) throw fromPostgrestError(groupErr)
    if (!group) throw Errors.notFound('Group not found (or not visible to you)')
    if (group.owner_id !== me) throw Errors.forbidden('Only the group owner can list invites')

    const { data, error } = await c.var.userClient
      .from('group_invites')
      .select('*')
      .eq('group_id', id)
      .order('created_at', { ascending: false })
    if (error) throw fromPostgrestError(error)

    return c.json((data ?? []) as InviteRow[])
  })

  // ----------------------------------------------------------------- public invite info
  const inviteInfo = createRoute({
    method: 'get',
    path: '/invites/{token}',
    tags: ['Invites'],
    summary: 'Inspect an invite by token (public)',
    description:
      'Pre-auth page data: which group, which email was invited, whether the invite is still usable. The token itself is the capability. Requires the service role key on the server.',
    request: { params: TokenParam },
    responses: {
      ...errorResponses(404, 503),
      200: { description: 'Invite info', content: { 'application/json': { schema: InviteInfoSchema } } },
    },
  })
  app.openapi(inviteInfo, async (c) => {
    const { token } = c.req.valid('param')
    requireServiceRoleConfig()
    const service = getServiceClient()!

    const { data: invite, error } = await service.from('group_invites').select('*').eq('token', token).maybeSingle()
    if (error) throw fromPostgrestError(error)

    if (!invite) {
      return c.json({
        token,
        group_name: 'unknown',
        group_id: '00000000-0000-0000-0000-000000000000',
        invited_email: 'unknown',
        status: 'revoked' as const,
        expires_at: null,
        already_member: false,
      })
    }
    const row = invite as InviteRow

    const { data: group } = await service.from('groups').select('name').eq('id', row.group_id).maybeSingle()

    // Is the invited email already a member of this group?
    let alreadyMember = false
    const match = await adminFindUserByEmail(row.email)
    if (match) {
      const { data: membership } = await service
        .from('group_members')
        .select('user_id')
        .eq('group_id', row.group_id)
        .eq('user_id', match.id)
        .maybeSingle()
      alreadyMember = membership !== null
    }

    const effectiveStatus: InviteRow['status'] | 'expired' =
      row.status === 'pending' && new Date(row.expires_at).getTime() < Date.now() ? 'expired' : row.status

    return c.json({
      token,
      group_name: group?.name ?? 'unknown',
      group_id: row.group_id,
      invited_email: row.email,
      status: effectiveStatus,
      expires_at: row.expires_at,
      already_member: alreadyMember,
    })
  })

  // ----------------------------------------------------------------- accept
  const accept = createRoute({
    method: 'post',
    path: '/invites/{token}/accept',
    tags: ['Invites'],
    summary: 'Accept an invite (auth required)',
    description:
      'Joins YOUR account to the group. The invited email must match your account email. Under RLS the join itself is gated on a pending, unexpired invite addressed to your email — this handler performs: insert membership (as you) → flip invite to accepted (as you). Idempotency: already a member → 409.',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: TokenParam },
    responses: {
      ...errorResponses(400, 401, 403, 404, 409, 422, 503),
      200: {
        description: 'You joined the group',
        content: {
          'application/json': {
            schema: z.object({
              group_id: UuidSchema,
              group_name: z.string(),
              role: z.enum(['owner', 'member']),
              message: z.string(),
            }),
          },
        },
      },
    },
  })
  app.openapi(accept, async (c) => {
    const { token } = c.req.valid('param')
    const me = c.var.user

    if (!me.email) throw Errors.badRequest('Your account has no email on file')

    // 1. Look up the invite (authenticated read allowed by RLS).
    const { data: invite, error: inviteErr } = await c.var.userClient
      .from('group_invites')
      .select('*')
      .eq('token', token)
      .maybeSingle()
    if (inviteErr) throw fromPostgrestError(inviteErr)
    if (!invite) throw Errors.notFound('Invite not found')
    const row = invite as InviteRow

    // 2. Validate state.
    if (row.status !== 'pending') {
      throw new ApiError(409, 'INVITE_NOT_PENDING', `This invite is already ${row.status}`)
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new ApiError(409, 'INVITE_EXPIRED', 'This invite has expired')
    }
    if (row.email.toLowerCase() !== me.email.toLowerCase()) {
      throw Errors.forbidden('This invite was addressed to a different email address')
    }

    // 3. Already a member? If the invite is still pending and addressed to
    // this account, the earlier join must have failed between the membership
    // insert and consuming the invite (or this is a retry) — consume it and
    // report success instead of stranding the user on a 409.
    const { data: existing } = await c.var.userClient
      .from('group_members')
      .select('user_id, role')
      .eq('group_id', row.group_id)
      .eq('user_id', me.id)
      .maybeSingle()
    if (existing) {
      const { error: consumeErr } = await c.var.userClient
        .from('group_invites')
        .update({ status: 'accepted' })
        .eq('token', token)
      if (!consumeErr) {
        const { data: group } = await c.var.userClient
          .from('groups')
          .select('name')
          .eq('id', row.group_id)
          .maybeSingle()
        return c.json({
          group_id: row.group_id,
          group_name: group?.name ?? 'unknown',
          role: 'member',
          message: `You joined ${group?.name ?? 'the group'}`,
        })
      }
      throw new ApiError(409, 'ALREADY_MEMBER', 'You are already a member of this group')
    }

    // 4. Join — RLS policy requires the pending invite we just verified.
    const { error: joinErr } = await c.var.userClient
      .from('group_members')
      .insert({ group_id: row.group_id, user_id: me.id, role: 'member' })
    if (joinErr) throw fromPostgrestError(joinErr)

    // 5. Consume the invite (invitee-only update policy + status guard trigger).
    const { error: consumeErr } = await c.var.userClient
      .from('group_invites')
      .update({ status: 'accepted' })
      .eq('token', token)
    if (consumeErr) throw fromPostgrestError(consumeErr)

    const { data: group } = await c.var.userClient.from('groups').select('name').eq('id', row.group_id).maybeSingle()

    return c.json({
      group_id: row.group_id,
      group_name: group?.name ?? 'unknown',
      role: 'member',
      message: `You joined ${group?.name ?? 'the group'}`,
    })
  })

  // ----------------------------------------------------------------- revoke
  const revoke = createRoute({
    method: 'post',
    path: '/invites/{token}/revoke',
    tags: ['Invites'],
    summary: 'Revoke a pending invite (owner only)',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: TokenParam },
    responses: {
      ...errorResponses(400, 401, 403, 404, 409, 503),
      200: {
        description: 'Invite revoked',
        content: { 'application/json': { schema: InviteSchema } },
      },
    },
  })
  app.openapi(revoke, async (c) => {
    const { token } = c.req.valid('param')
    const me = c.var.user.id

    const { data: invite, error } = await c.var.userClient
      .from('group_invites')
      .select('*')
      .eq('token', token)
      .maybeSingle()
    if (error) throw fromPostgrestError(error)
    if (!invite) throw Errors.notFound('Invite not found')
    const row = invite as InviteRow

    // Only the owning group's owner may revoke (RLS enforces as well).
    const { data: group } = await c.var.userClient
      .from('groups')
      .select('owner_id')
      .eq('id', row.group_id)
      .maybeSingle()
    if (!group) throw Errors.notFound('Group not found')
    if (group.owner_id !== me) throw Errors.forbidden('Only the group owner can revoke invites')
    if (row.status !== 'pending') {
      throw new ApiError(409, 'INVITE_NOT_PENDING', `This invite is already ${row.status}`)
    }

    const { data: updated, error: updateErr } = await c.var.userClient
      .from('group_invites')
      .update({ status: 'revoked' })
      .eq('token', token)
      .select('*')
      .single()
    if (updateErr) throw fromPostgrestError(updateErr)

    return c.json(updated as InviteRow)
  })
}
