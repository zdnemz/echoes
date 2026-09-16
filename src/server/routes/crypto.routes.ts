import { createRoute, z } from '@hono/zod-openapi'
import {
  DeviceView,
  DistributeGroupKeysSchema,
  EncryptMigrationResultSchema,
  EncryptMigrationSchema,
  GroupDeviceView,
  GroupKeyWrapsView,
  RegisterDeviceSchema,
  UuidSchema,
} from '../schemas'
import { Errors, fromPostgrestError } from '../errors'
import { requireAuth } from '../auth'
import { bearerAuth, errorResponses, jsonBody, requireGroupOwner, requireGroupVisible, type App } from './helpers'

const GroupIdParam = z.object({
  id: UuidSchema.openapi({ param: { name: 'id', in: 'path' } }),
})

export function registerCryptoRoutes(app: App) {
  const registerDevice = createRoute({
    method: 'post',
    path: '/me/devices',
    tags: ['Encryption'],
    summary: 'Register a device public key',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { body: jsonBody(RegisterDeviceSchema) },
    responses: {
      ...errorResponses(400, 401, 503),
      200: { description: 'Device registered', content: { 'application/json': { schema: DeviceView } } },
    },
  })
  app.openapi(registerDevice, async (c) => {
    const body = c.req.valid('json')
    const me = c.var.user.id
    const { data, error } = await c.var.userClient
      .from('user_devices')
      .insert({ user_id: me, public_key: body.public_key, label: body.label ?? null })
      .select('id, user_id, public_key, label, created_at')
      .single()
    if (error) throw fromPostgrestError(error)
    return c.json(data as z.infer<typeof DeviceView>)
  })

  const getDevices = createRoute({
    method: 'get',
    path: '/me/devices',
    tags: ['Encryption'],
    summary: 'List your devices',
    security: [bearerAuth],
    middleware: [requireAuth],
    responses: {
      ...errorResponses(401, 503),
      200: { description: 'Your devices', content: { 'application/json': { schema: z.array(DeviceView) } } },
    },
  })
  app.openapi(getDevices, async (c) => {
    const { data, error } = await c.var.userClient
      .from('user_devices')
      .select('id, user_id, public_key, label, created_at')
      .eq('user_id', c.var.user.id)
      .order('created_at', { ascending: false })
    if (error) throw fromPostgrestError(error)
    return c.json((data ?? []) as Array<z.infer<typeof DeviceView>>)
  })

  const getGroupWrap = createRoute({
    method: 'get',
    path: '/groups/{id}/key',
    tags: ['Encryption'],
    summary: 'Fetch all your sealed boxes for a group',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: GroupIdParam },
    responses: {
      ...errorResponses(401, 404, 503),
      200: { description: 'Your sealed boxes', content: { 'application/json': { schema: GroupKeyWrapsView } } },
    },
  })
  app.openapi(getGroupWrap, async (c) => {
    const { id } = c.req.valid('param')
    const { data, error } = await c.var.userClient
      .from('group_key_wraps')
      .select('device_id, generation, sealed_box')
      .eq('group_id', id)
      .eq('user_id', c.var.user.id)
    if (error) throw fromPostgrestError(error)
    if (!data || data.length === 0) throw Errors.notFound('No group key addressed to you')
    return c.json({ wraps: data })
  })

  const distributeGroupKeys = createRoute({
    method: 'put',
    path: '/groups/{id}/key',
    tags: ['Encryption'],
    summary: 'Distribute or rotate the group CEK',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: GroupIdParam, body: jsonBody(DistributeGroupKeysSchema) },
    responses: {
      ...errorResponses(400, 401, 403, 404, 422, 503),
      200: { description: 'Distribution stored', content: { 'application/json': { schema: GroupKeyWrapsView } } },
    },
  })
  app.openapi(distributeGroupKeys, async (c) => {
    const { id } = c.req.valid('param')
    const { generation, replace, wraps } = c.req.valid('json')
    const me = c.var.user.id

    const group = await requireGroupOwner(c.var.userClient, id, me, {
      select: 'id, owner_id, group_members(user_id, role)',
    }).catch(() => null)
    const isOwner = group !== null

    if (replace && !isOwner) throw Errors.badRequest('Only the owner can replace every wrap')

    // Resolve every targeted device to its owner. The row's user_id must be
    // the device's real owner (read policies are keyed on it), so it is never
    // taken from the caller.
    const { data: targeted } = await c.var.userClient
      .from('user_devices')
      .select('id, user_id')
      .in(
        'id',
        wraps.map((w) => w.device_id),
      )
    const ownerOf = new Map((targeted ?? []).map((d) => [d.id as string, d.user_id as string]))
    for (const w of wraps) {
      if (!ownerOf.has(w.device_id)) throw Errors.badRequest('Unknown device in wraps')
    }

    if (!isOwner) {
      // A member may only bring their OWN new devices into the group.
      for (const w of wraps) {
        if (ownerOf.get(w.device_id) !== me) {
          throw Errors.badRequest('Non-owners can only write wraps for their own devices')
        }
      }
    }

    if (replace) {
      // A rotation must never lock someone out silently: every member that
      // has at least one registered device needs a box in the new generation.
      const members = ((group as unknown as { group_members: Array<{ user_id: string }> }).group_members ?? []).map(
        (m) => m.user_id,
      )
      const covered = new Set(wraps.map((w) => ownerOf.get(w.device_id)))
      const { data: memberDevices } = await c.var.userClient
        .from('user_devices')
        .select('user_id')
        .in('user_id', members)
      const membersWithDevices = new Set((memberDevices ?? []).map((d) => d.user_id as string))
      const uncovered = members.filter((m) => membersWithDevices.has(m) && !covered.has(m))
      if (uncovered.length > 0) {
        throw Errors.badRequest('Sealed boxes must cover every member that has a registered device')
      }

      const { error: delErr } = await c.var.userClient.from('group_key_wraps').delete().eq('group_id', id)
      if (delErr) throw fromPostgrestError(delErr)
    }

    const rows = wraps.map((w) => ({
      group_id: id,
      device_id: w.device_id,
      user_id: ownerOf.get(w.device_id) as string,
      generation,
      sealed_box: w.sealed_box,
    }))

    const { error: insErr } = await c.var.userClient
      .from('group_key_wraps')
      .upsert(rows, { onConflict: 'group_id,device_id' })
    if (insErr) throw fromPostgrestError(insErr)

    return c.json({ wraps: wraps.map((w) => ({ device_id: w.device_id, generation, sealed_box: w.sealed_box })) })
  })

  const groupDevices = createRoute({
    method: 'get',
    path: '/groups/{id}/devices',
    tags: ['Encryption'],
    summary: 'Device keys of group members with wrap status',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: GroupIdParam },
    responses: {
      ...errorResponses(401, 404, 503),
      200: {
        description: 'Member devices',
        content: { 'application/json': { schema: z.array(GroupDeviceView) } },
      },
    },
  })
  app.openapi(groupDevices, async (c) => {
    const { id } = c.req.valid('param')
    await requireGroupVisible(c.var.userClient, id, 'id')

    const { data: members, error: mErr } = await c.var.userClient
      .from('group_members')
      .select('user_id')
      .eq('group_id', id)
    if (mErr) throw fromPostgrestError(mErr)
    const memberIds = (members ?? []).map((m) => m.user_id)
    if (memberIds.length === 0) return c.json([])

    const { data: devices, error: dErr } = await c.var.userClient
      .from('user_devices')
      .select('id, user_id, public_key')
      .in('user_id', memberIds)
    if (dErr) throw fromPostgrestError(dErr)

    const { data: existingWraps, error: wErr } = await c.var.userClient
      .from('group_key_wraps')
      .select('device_id')
      .eq('group_id', id)
    if (wErr) throw fromPostgrestError(wErr)
    const wrappedIds = new Set((existingWraps ?? []).map((w) => w.device_id))

    const result = (devices ?? []).map((d) => ({
      user_id: d.user_id,
      device_id: d.id,
      public_key: d.public_key,
      has_wrap: wrappedIds.has(d.id),
    }))
    return c.json(result as Array<z.infer<typeof GroupDeviceView>>)
  })

  const memberKeys = createRoute({
    method: 'get',
    path: '/groups/{id}/member-keys',
    tags: ['Encryption'],
    summary: 'Public encryption keys of a group members',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: GroupIdParam },
    responses: {
      ...errorResponses(401, 404, 503),
      200: {
        description: 'user_id to public key map',
        content: {
          'application/json': { schema: z.object({ keys: z.record(z.string(), z.string().nullable()) }) },
        },
      },
    },
  })
  app.openapi(memberKeys, async (c) => {
    const { id } = c.req.valid('param')
    await requireGroupVisible(c.var.userClient, id, 'id')
    const { data: members, error: mErr } = await c.var.userClient
      .from('group_members')
      .select('user_id')
      .eq('group_id', id)
    if (mErr) throw fromPostgrestError(mErr)
    const memberIds = (members ?? []).map((m) => m.user_id)
    if (memberIds.length === 0) return c.json({ keys: {} })

    const { data: devices, error: dErr } = await c.var.userClient
      .from('user_devices')
      .select('user_id, public_key')
      .in('user_id', memberIds)
    if (dErr) throw fromPostgrestError(dErr)

    const keys: Record<string, string | null> = {}
    for (const d of devices ?? []) {
      if (!keys[d.user_id]) keys[d.user_id] = d.public_key
    }
    for (const uid of memberIds) {
      if (!keys[uid]) keys[uid] = null
    }
    return c.json({ keys })
  })

  const rotateGroupKeys = createRoute({
    method: 'post',
    path: '/groups/{id}/rotate',
    tags: ['Encryption'],
    summary: 'Re-wrap group-scope entry keys under a new CEK (owner only)',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: {
      params: GroupIdParam,
      body: jsonBody(
        z
          .object({
            rewraps: z
              .array(
                z
                  .object({
                    entry_id: UuidSchema,
                    wrapped_key: z.string().min(1).max(8192),
                  })
                  .strict(),
              )
              .min(1)
              .max(1000),
          })
          .strict(),
      ),
    },
    responses: {
      ...errorResponses(400, 401, 403, 422, 503),
      200: {
        description: 'Rotation applied',
        content: { 'application/json': { schema: z.object({ rewrapped: z.number().int() }) } },
      },
    },
  })
  app.openapi(rotateGroupKeys, async (c) => {
    const { id } = c.req.valid('param')
    const { rewraps } = c.req.valid('json')
    await requireGroupOwner(c.var.userClient, id, c.var.user.id)
    const { data, error } = await c.var.userClient
      .from('entry_key_wraps')
      .upsert(
        rewraps.map((r) => ({ entry_id: r.entry_id, scope: 'group', wrapped_key: r.wrapped_key })),
        { onConflict: 'entry_id,scope' },
      )
      .select('entry_id')
    if (error) throw fromPostgrestError(error)
    return c.json({ rewrapped: data?.length ?? 0 })
  })

  const migrateEntries = createRoute({
    method: 'post',
    path: '/me/encrypt-migrate',
    tags: ['Encryption'],
    summary: 'Flip a batch of your entries to encrypted',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { body: jsonBody(EncryptMigrationSchema) },
    responses: {
      ...errorResponses(400, 401, 422, 503),
      200: {
        description: 'Batch stored',
        content: { 'application/json': { schema: EncryptMigrationResultSchema } },
      },
    },
  })
  app.openapi(migrateEntries, async (c) => {
    const { entries } = c.req.valid('json')
    const me = c.var.user.id
    const flipped: string[] = []
    for (const e of entries) {
      const { data: row, error: rowErr } = await c.var.userClient
        .from('entries')
        .update({ title: e.title_cipher, body: e.body_cipher, encrypted: true })
        .eq('id', e.id)
        .eq('author_id', me)
        .eq('encrypted', false)
        .select('id')
        .maybeSingle()
      if (rowErr) {
        const code = (rowErr as { code?: string }).code
        if (code !== 'PGRST116') throw fromPostgrestError(rowErr)
        continue
      }
      if (row) flipped.push((row as { id: string }).id)
    }
    if (flipped.length > 0) {
      const { error: wrapErr } = await c.var.userClient
        .from('entry_key_wraps')
        .insert(
          entries
            .filter((e) => flipped.includes(e.id))
            .flatMap((e) => [
              { entry_id: e.id, scope: 'author' as const, wrapped_key: e.author_wrap },
              ...(e.group_wrap ? [{ entry_id: e.id, scope: 'group' as const, wrapped_key: e.group_wrap }] : []),
            ]),
        )
      if (wrapErr) throw fromPostgrestError(wrapErr)
    }
    const { count, error: countErr } = await c.var.userClient
      .from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', me)
      .eq('encrypted', false)
    if (countErr) throw fromPostgrestError(countErr)
    return c.json({ migrated: flipped.length, remaining: count ?? 0 })
  })
}
