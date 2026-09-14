import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createRoute, z } from '@hono/zod-openapi'
import {
  CreateInviteLinkSchema,
  InviteLinkSchema,
  JoinRequestSchema,
  JoinResultSchema,
  LinkInfoSchema,
  UuidSchema,
} from '../schemas'
import { ApiError, Errors, fromPostgrestError } from '../errors'
import { requireAuth } from '../auth'
import { getServiceClient } from '../supabase'
import { getAppUrl, getSupabaseConfig } from '../env'
import { bearerAuth, errorResponses, jsonBody, requireServiceRoleConfig, type App } from './helpers'
import { inviteLinkRateLimit } from '../rate-limit'

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

const RequestIdParam = z.object({
  id: UuidSchema.openapi({ param: { name: 'id', in: 'path' } }),
  requestId: UuidSchema.openapi({ param: { name: 'requestId', in: 'path' } }),
})

interface GroupLinkRow {
  id: string
  owner_id: string
  name: string
  auto_accept: boolean
  invite_token: string | null
  invite_expires_at: string | null
}

interface JoinRequestRow {
  id: string
  group_id: string
  user_id: string
  status: 'pending' | 'approved' | 'denied'
  created_at: string
}

/** Build the public accept link for an invite token. */
export function inviteAcceptUrl(token: string): string {
  return `${getAppUrl()}/invites/accept?token=${encodeURIComponent(token)}`
}

function newToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Constant-time token comparison (tokens are unguessable, this blocks probing). */
function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

function linkUsable(group: GroupLinkRow): boolean {
  if (!group.invite_token) return false
  if (group.invite_expires_at && new Date(group.invite_expires_at).getTime() < Date.now()) return false
  return true
}

function toLinkPayload(group: GroupLinkRow) {
  return {
    url: group.invite_token ? inviteAcceptUrl(group.invite_token) : null,
    expires_at: group.invite_expires_at,
    auto_accept: group.auto_accept,
  }
}

export function registerInviteRoutes(app: App) {
  // ----------------------------------------------------------------- get link
  const getLink = createRoute({
    method: 'get',
    path: '/groups/{id}/invite-link',
    tags: ['Invites'],
    summary: 'Current invite link state (owner only)',
    description: 'Returns the active share link (or null when there is none) plus the group auto-accept switch.',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: GroupIdParam },
    responses: {
      ...errorResponses(401, 403, 404, 503),
      200: { description: 'Invite link', content: { 'application/json': { schema: InviteLinkSchema } } },
    },
  })
  app.openapi(getLink, async (c) => {
    const { id } = c.req.valid('param')
    const me = c.var.user.id

    const { data: group, error } = await c.var.userClient
      .from('groups')
      .select('id, owner_id, name, auto_accept, invite_token, invite_expires_at')
      .eq('id', id)
      .maybeSingle()
    if (error) throw fromPostgrestError(error)
    if (!group) throw Errors.notFound('Group not found (or not visible to you)')
    if ((group as GroupLinkRow).owner_id !== me) throw Errors.forbidden('Only the group owner manages the invite link')

    return c.json(toLinkPayload(group as GroupLinkRow))
  })

  // ----------------------------------------------------------------- rotate link
  const rotateLink = createRoute({
    method: 'post',
    path: '/groups/{id}/invite-link',
    tags: ['Invites'],
    summary: 'Create or rotate the invite link (owner only)',
    description:
      'Issues a fresh link token (any previous link dies instantly). Pass expires_in_hours for a self-expiring link, or null for one that never expires.',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: GroupIdParam, body: jsonBody(CreateInviteLinkSchema) },
    responses: {
      ...errorResponses(400, 401, 403, 404, 422, 503),
      201: { description: 'Invite link', content: { 'application/json': { schema: InviteLinkSchema } } },
    },
  })
  app.openapi(rotateLink, async (c) => {
    const { id } = c.req.valid('param')
    const { expires_in_hours } = c.req.valid('json')
    const me = c.var.user.id

    const token = newToken()
    // Omitting expires_in_hours means "never expires". The UI always sends an
    // explicit value (default 168 = 7 days); this stays the documented default
    // for API callers.
    const expiresAt =
      expires_in_hours === null || expires_in_hours === undefined
        ? null
        : new Date(Date.now() + expires_in_hours * 3600_000).toISOString()

    const { data: group, error } = await c.var.userClient
      .from('groups')
      .update({ invite_token: token, invite_expires_at: expiresAt })
      .eq('id', id)
      .eq('owner_id', me)
      .select('id, owner_id, name, auto_accept, invite_token, invite_expires_at')
      .maybeSingle()
    if (error) throw fromPostgrestError(error)
    if (!group) throw Errors.notFound('Group not found, or you are not its owner')

    return c.json(toLinkPayload(group as GroupLinkRow), 201)
  })

  // ----------------------------------------------------------------- revoke link
  const revokeLink = createRoute({
    method: 'delete',
    path: '/groups/{id}/invite-link',
    tags: ['Invites'],
    summary: 'Revoke the invite link (owner only)',
    description: 'Kills the active link instantly. Outstanding join requests stay in the queue.',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: GroupIdParam },
    responses: {
      ...errorResponses(401, 403, 404, 503),
      204: { description: 'Invite link revoked' },
    },
  })
  app.openapi(revokeLink, async (c) => {
    const { id } = c.req.valid('param')
    const me = c.var.user.id

    const { data: group, error } = await c.var.userClient
      .from('groups')
      .update({ invite_token: null, invite_expires_at: null })
      .eq('id', id)
      .eq('owner_id', me)
      .select('id')
      .maybeSingle()
    if (error) throw fromPostgrestError(error)
    if (!group) throw Errors.notFound('Group not found, or you are not its owner')

    return c.body(null, 204)
  })

  // ----------------------------------------------------------------- public link info
  const linkInfo = createRoute({
    method: 'get',
    path: '/invites/link/{token}',
    tags: ['Invites'],
    summary: 'Inspect an invite link (public)',
    description:
      'Pre-auth page data: which group the link opens and whether joining is instant. The token itself is the capability. Requires the service role key on the server.',
    // No session required, but each call is an RLS-bypassing round-trip —
    // bounded per client so it cannot be used as an amplifier.
    middleware: [inviteLinkRateLimit()],
    request: { params: TokenParam },
    responses: {
      ...errorResponses(404, 429, 503),
      200: { description: 'Link info', content: { 'application/json': { schema: LinkInfoSchema } } },
    },
  })
  app.openapi(linkInfo, async (c) => {
    const { token } = c.req.valid('param')
    requireServiceRoleConfig()
    const service = getServiceClient()!

    const { data, error } = await service
      .from('groups')
      .select('id, name, auto_accept, invite_token, invite_expires_at')
      .eq('invite_token', token)
      .maybeSingle()
    if (error) throw fromPostgrestError(error)
    if (!data) throw Errors.notFound('This invite link is invalid or was revoked')

    const group = data as GroupLinkRow
    return c.json({
      token,
      group_name: group.name,
      group_id: group.id,
      auto_accept: group.auto_accept,
      expires_at: group.invite_expires_at,
      usable: linkUsable(group),
    })
  })

  // ----------------------------------------------------------------- join via link
  const joinViaLink = createRoute({
    method: 'post',
    path: '/invites/link/{token}/join',
    tags: ['Invites'],
    summary: 'Join (or request to join) through an invite link',
    description:
      'One call for the whole flow: instant join on auto-accept groups, join-request filing on manual ones. Idempotent — already a member (or an open request) reports back success instead of an error.',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: TokenParam },
    responses: {
      ...errorResponses(400, 401, 403, 404, 409, 422, 503),
      200: { description: 'Join outcome', content: { 'application/json': { schema: JoinResultSchema } } },
    },
  })
  app.openapi(joinViaLink, async (c) => {
    const { token } = c.req.valid('param')
    const me = c.var.user
    requireServiceRoleConfig()
    const service = getServiceClient()!

    const { data, error } = await service
      .from('groups')
      .select('id, name, auto_accept, invite_token, invite_expires_at')
      .eq('invite_token', token)
      .maybeSingle()
    if (error) throw fromPostgrestError(error)
    if (!data) throw Errors.notFound('This invite link is invalid or was revoked')
    const group = data as GroupLinkRow

    if (!tokensEqual(group.invite_token ?? '', token)) {
      // Unreachable via the indexed lookup above (defense in depth).
      throw Errors.notFound('This invite link is invalid or was revoked')
    }
    if (!linkUsable(group)) {
      throw new ApiError(409, 'LINK_EXPIRED', 'This invite link has expired — ask the owner for a fresh one')
    }

    // Already in? Report success (idempotent retries, double taps).
    const { data: existing, error: existingErr } = await service
      .from('group_members')
      .select('user_id')
      .eq('group_id', group.id)
      .eq('user_id', me.id)
      .maybeSingle()
    // Must not be swallowed: a failed lookup reads as "not a member", so the
    // handler would insert a duplicate membership and 409 on a first join.
    if (existingErr) throw fromPostgrestError(existingErr)
    if (existing) {
      return c.json({
        status: 'member' as const,
        group_id: group.id,
        group_name: group.name,
        message: `You're already in ${group.name}`,
      })
    }

    // Open request already filed? Report it instead of stacking another.
    const { data: openRequest, error: openReqErr } = await service
      .from('group_join_requests')
      .select('id')
      .eq('group_id', group.id)
      .eq('user_id', me.id)
      .eq('status', 'pending')
      .maybeSingle()
    // Same reasoning: a swallowed failure files a second request and hits the
    // unique pending-request constraint.
    if (openReqErr) throw fromPostgrestError(openReqErr)
    if (openRequest) {
      return c.json({
        status: 'pending' as const,
        group_id: group.id,
        group_name: group.name,
        message: `Your request to join ${group.name} is waiting on the owner`,
      })
    }

    if (group.auto_accept) {
      const { error: joinErr } = await service
        .from('group_members')
        .insert({ group_id: group.id, user_id: me.id, role: 'member' })
      if (joinErr) throw fromPostgrestError(joinErr)
      return c.json({
        status: 'joined' as const,
        group_id: group.id,
        group_name: group.name,
        message: `You joined ${group.name}`,
      })
    }

    const { error: reqErr } = await service.from('group_join_requests').insert({ group_id: group.id, user_id: me.id })
    if (reqErr) throw fromPostgrestError(reqErr)
    return c.json({
      status: 'requested' as const,
      group_id: group.id,
      group_name: group.name,
      message: `Request sent — the owner of ${group.name} will approve it`,
    })
  })

  // ----------------------------------------------------------------- list requests
  const listRequests = createRoute({
    method: 'get',
    path: '/groups/{id}/requests',
    tags: ['Invites'],
    summary: 'List join requests for a group (owner only)',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: GroupIdParam },
    responses: {
      ...errorResponses(401, 403, 404, 503),
      200: { description: 'Join requests', content: { 'application/json': { schema: z.array(JoinRequestSchema) } } },
    },
  })
  app.openapi(listRequests, async (c) => {
    const { id } = c.req.valid('param')
    const me = c.var.user.id

    const { data: group, error: groupErr } = await c.var.userClient
      .from('groups')
      .select('owner_id')
      .eq('id', id)
      .maybeSingle()
    if (groupErr) throw fromPostgrestError(groupErr)
    if (!group) throw Errors.notFound('Group not found (or not visible to you)')
    if ((group as { owner_id: string }).owner_id !== me) {
      throw Errors.forbidden('Only the group owner reviews join requests')
    }

    requireServiceRoleConfig()
    const service = getServiceClient()!
    const { data, error } = await service
      .from('group_join_requests')
      .select('id, group_id, user_id, status, created_at')
      .eq('group_id', id)
      .order('created_at', { ascending: true })
    if (error) throw fromPostgrestError(error)

    const rows = (data ?? []) as JoinRequestRow[]
    // Requesters are not group members yet, so their profiles are invisible
    // under RLS — resolve names with the service role (owner-only route).
    const { data: profiles, error: profilesErr } = await service
      .from('profiles')
      .select('id, display_name')
      .in(
        'id',
        rows.map((r) => r.user_id),
      )
    if (profilesErr) throw fromPostgrestError(profilesErr)
    const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name as string | null]))

    // Emails come from Auth (admin API); best-effort, never blocking.
    const cfg = getSupabaseConfig()
    const emails = new Map<string, string | null>()
    await Promise.all(
      rows.map(async (r) => {
        if (!cfg?.serviceRoleKey) return
        try {
          const res = await fetch(`${cfg.url}/auth/v1/admin/users/${r.user_id}`, {
            headers: {
              apikey: cfg.serviceRoleKey,
              Authorization: `Bearer ${cfg.serviceRoleKey}`,
            },
          })
          if (res.ok) {
            const u = (await res.json()) as { email?: string | null }
            emails.set(r.user_id, u.email ?? null)
          }
        } catch {
          /* cosmetic only */
        }
      }),
    )

    return c.json(
      rows.map((r) => ({
        id: r.id,
        group_id: r.group_id,
        user_id: r.user_id,
        email: emails.get(r.user_id) ?? null,
        display_name: names.get(r.user_id) ?? null,
        status: r.status,
        created_at: r.created_at,
      })),
    )
  })

  // ----------------------------------------------------------------- approve / deny
  const decideRequest = (decision: 'approved' | 'denied') =>
    createRoute({
      method: 'post',
      path: `/groups/{id}/requests/{requestId}/${decision}`,
      tags: ['Invites'],
      summary: `${decision === 'approved' ? 'Approve' : 'Deny'} a join request (owner only)`,
      security: [bearerAuth],
      middleware: [requireAuth],
      request: { params: RequestIdParam },
      responses: {
        ...errorResponses(400, 401, 403, 404, 409, 503),
        200: { description: 'Request decided', content: { 'application/json': { schema: JoinRequestSchema } } },
      },
    })

  for (const decision of ['approved', 'denied'] as const) {
    app.openapi(decideRequest(decision), async (c) => {
      const { id, requestId } = c.req.valid('param')
      const me = c.var.user.id

      const { data: group, error: groupErr } = await c.var.userClient
        .from('groups')
        .select('owner_id, name')
        .eq('id', id)
        .maybeSingle()
      if (groupErr) throw fromPostgrestError(groupErr)
      if (!group) throw Errors.notFound('Group not found (or not visible to you)')
      if ((group as { owner_id: string }).owner_id !== me) {
        throw Errors.forbidden('Only the group owner reviews join requests')
      }

      requireServiceRoleConfig()
      const service = getServiceClient()!

      const { data: request, error: reqErr } = await service
        .from('group_join_requests')
        .select('id, group_id, user_id, status, created_at')
        .eq('id', requestId)
        .eq('group_id', id)
        .maybeSingle()
      if (reqErr) throw fromPostgrestError(reqErr)
      if (!request) throw Errors.notFound('Join request not found')
      const row = request as JoinRequestRow
      if (row.status !== 'pending') {
        throw new ApiError(409, 'REQUEST_DECIDED', `This request is already ${row.status}`)
      }

      if (decision === 'approved') {
        const { error: joinErr } = await service
          .from('group_members')
          .insert({ group_id: id, user_id: row.user_id, role: 'member' })
        // Already a member through another path (e.g. second link): still
        // consume the request instead of stranding it.
        if (joinErr && joinErr.code !== '23505') throw fromPostgrestError(joinErr)
      }

      const { data: updated, error: updateErr } = await service
        .from('group_join_requests')
        .update({ status: decision })
        .eq('id', requestId)
        .select('id, group_id, user_id, status, created_at')
        .single()
      if (updateErr) throw fromPostgrestError(updateErr)

      return c.json({ ...(updated as JoinRequestRow), email: null, display_name: null })
    })
  }
}
