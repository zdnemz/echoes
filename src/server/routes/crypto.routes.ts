import { createRoute, z } from '@hono/zod-openapi'
import {
  DistributeGroupKeysSchema,
  EncryptMigrationResultSchema,
  EncryptMigrationSchema,
  GroupKeyWrapsView,
  GroupMemberView,
  KeyMaterialSchema,
  PasskeyBundleSchema,
  PublishKeysSchema,
  PublishPasskeySchema,
  UuidSchema,
} from '../schemas'
import { Errors, fromPostgrestError } from '../errors'
import { requireAuth } from '../auth'
import { bearerAuth, errorResponses, jsonBody, requireGroupOwner, requireGroupVisible, type App } from './helpers'

const GroupIdParam = z.object({
  id: UuidSchema.openapi({ param: { name: 'id', in: 'path' } }),
})

interface PasskeyRow {
  enc_passkey_salt: string | null
  enc_passkey_credential_id: string | null
  enc_passkey_wrapped_dek: string | null
}

function passkeyOf(row: PasskeyRow | null): z.infer<typeof PasskeyBundleSchema> | null {
  if (!row || !row.enc_passkey_salt || !row.enc_passkey_credential_id || !row.enc_passkey_wrapped_dek) return null
  return {
    salt: row.enc_passkey_salt,
    credential_id: row.enc_passkey_credential_id,
    wrapped_dek: row.enc_passkey_wrapped_dek,
  }
}

export function registerCryptoRoutes(app: App) {
  // --------------------------------------------------------------- account keys
  // One bundle per account: the DEK and ECDH identity, both wrapped under a
  // PIN-derived KEK. The server stores opaque blobs only — the PIN never
  // arrives, so this material cannot be decrypted here. A device that knows
  // the PIN re-derives the same KEK and recovers identical keys.
  const getKeys = createRoute({
    method: 'get',
    path: '/me/keys',
    tags: ['Encryption'],
    summary: 'Fetch your account key bundle',
    description:
      'The wrapped DEK + wrapped identity private key + public identity key. 404 until the account has chosen a PIN and published a bundle — that state is what tells a new device to ask for a PIN rather than create one.',
    security: [bearerAuth],
    middleware: [requireAuth],
    responses: {
      ...errorResponses(401, 404, 503),
      200: { description: 'Your key bundle', content: { 'application/json': { schema: KeyMaterialSchema } } },
    },
  })
  app.openapi(getKeys, async (c) => {
    const { data, error } = await c.var.userClient
      .from('profiles')
      .select(
        'enc_salt, enc_iterations, enc_wrapped_dek, enc_public_key, enc_wrapped_private_key, enc_passkey_salt, enc_passkey_credential_id, enc_passkey_wrapped_dek',
      )
      .eq('id', c.var.user.id)
      .maybeSingle()
    if (error) throw fromPostgrestError(error)
    if (!data || !data.enc_wrapped_dek) throw Errors.notFound('No account keys yet')
    const row = data as {
      enc_salt: string | null
      enc_iterations: number | null
      enc_wrapped_dek: string | null
      enc_public_key: string | null
      enc_wrapped_private_key: string | null
    } & PasskeyRow
    return c.json({
      salt: row.enc_salt,
      iterations: row.enc_iterations,
      wrapped_dek: row.enc_wrapped_dek,
      public_key: row.enc_public_key,
      wrapped_private_key: row.enc_wrapped_private_key,
      passkey: passkeyOf(row),
    })
  })

  const publishKeys = createRoute({
    method: 'put',
    path: '/me/keys',
    tags: ['Encryption'],
    summary: 'Publish or replace your account key bundle',
    description:
      'Used once at provisioning (after choosing a PIN) and again on a PIN change. Replacing an existing bundle requires previous_wrapped_dek equal to the stored value — a second device must never be able to orphan an account’s history by minting fresh keys over it.',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { body: jsonBody(PublishKeysSchema) },
    responses: {
      ...errorResponses(400, 401, 409, 503),
      200: { description: 'Bundle stored', content: { 'application/json': { schema: KeyMaterialSchema } } },
    },
  })
  app.openapi(publishKeys, async (c) => {
    const body = c.req.valid('json')
    const me = c.var.user.id

    const { data: existing, error: readErr } = await c.var.userClient
      .from('profiles')
      .select('enc_wrapped_dek, enc_passkey_salt, enc_passkey_credential_id, enc_passkey_wrapped_dek')
      .eq('id', me)
      .maybeSingle()
    if (readErr) throw fromPostgrestError(readErr)
    const current = (existing as { enc_wrapped_dek: string | null } | null)?.enc_wrapped_dek ?? null

    // Overwriting an existing bundle without proving possession of the current
    // one would permanently orphan every entry already wrapped under the old
    // DEK. 409 tells the client to unlock with the current PIN first.
    if (current && body.previous_wrapped_dek !== current) {
      throw Errors.conflict('KEYS_EXIST', 'Keys already exist — unlock with the current PIN to change them')
    }

    const { error } = await c.var.userClient
      .from('profiles')
      .update({
        enc_salt: body.salt,
        enc_iterations: body.iterations,
        enc_wrapped_dek: body.wrapped_dek,
        enc_public_key: body.public_key,
        enc_wrapped_private_key: body.wrapped_private_key,
      })
      .eq('id', me)
    if (error) throw fromPostgrestError(error)

    return c.json({
      salt: body.salt,
      iterations: body.iterations,
      wrapped_dek: body.wrapped_dek,
      public_key: body.public_key,
      wrapped_private_key: body.wrapped_private_key,
      passkey: passkeyOf(existing as PasskeyRow | null),
    })
  })

  // --------------------------------------------------------------- passkey unlock
  // A second way to open the same DEK, bound to one authenticator on one
  // browser. Registering needs the unlocked vault (the DEK is in memory);
  // the PIN stays the portable path and is never weakened by this.
  const setPasskey = createRoute({
    method: 'put',
    path: '/me/keys/passkey',
    tags: ['Encryption'],
    summary: 'Register or replace your passkey unlock',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { body: jsonBody(PublishPasskeySchema) },
    responses: {
      ...errorResponses(400, 401, 404, 503),
      200: { description: 'Passkey stored', content: { 'application/json': { schema: PasskeyBundleSchema } } },
    },
  })
  app.openapi(setPasskey, async (c) => {
    const body = c.req.valid('json')
    const me = c.var.user.id

    const { data: existing, error: readErr } = await c.var.userClient
      .from('profiles')
      .select('enc_wrapped_dek')
      .eq('id', me)
      .maybeSingle()
    if (readErr) throw fromPostgrestError(readErr)
    if (!(existing as { enc_wrapped_dek: string | null } | null)?.enc_wrapped_dek) {
      throw Errors.notFound('No account keys yet — choose a PIN first')
    }

    const { error } = await c.var.userClient
      .from('profiles')
      .update({
        enc_passkey_salt: body.salt,
        enc_passkey_credential_id: body.credential_id,
        enc_passkey_wrapped_dek: body.wrapped_dek,
      })
      .eq('id', me)
    if (error) throw fromPostgrestError(error)

    return c.json({ salt: body.salt, credential_id: body.credential_id, wrapped_dek: body.wrapped_dek })
  })

  const clearPasskey = createRoute({
    method: 'delete',
    path: '/me/keys/passkey',
    tags: ['Encryption'],
    summary: 'Remove your passkey unlock',
    security: [bearerAuth],
    middleware: [requireAuth],
    responses: {
      ...errorResponses(401, 503),
      200: {
        description: 'Passkey removed',
        content: { 'application/json': { schema: z.object({ removed: z.boolean() }) } },
      },
    },
  })
  app.openapi(clearPasskey, async (c) => {
    const { error } = await c.var.userClient
      .from('profiles')
      .update({ enc_passkey_salt: null, enc_passkey_credential_id: null, enc_passkey_wrapped_dek: null })
      .eq('id', c.var.user.id)
    if (error) throw fromPostgrestError(error)
    return c.json({ removed: true })
  })

  // --------------------------------------------------------------- group CEK boxes
  const getGroupWrap = createRoute({
    method: 'get',
    path: '/groups/{id}/key',
    tags: ['Encryption'],
    summary: 'Fetch your sealed box for a group',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: GroupIdParam },
    responses: {
      ...errorResponses(401, 404, 503),
      200: { description: 'Your sealed box', content: { 'application/json': { schema: GroupKeyWrapsView } } },
    },
  })
  app.openapi(getGroupWrap, async (c) => {
    const { id } = c.req.valid('param')
    const { data, error } = await c.var.userClient
      .from('group_key_wraps')
      .select('user_id, generation, sealed_box')
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
    description:
      'One sealed box per member, addressed to their account identity key. The owner may replace the whole set (rotation); a member may only ADD boxes for members who lack one (cooperative catch-up), never replace.',
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
      select: 'id, owner_id, group_members(user_id)',
    }).catch(() => null)
    const isOwner = group !== null

    if (replace && !isOwner) throw Errors.badRequest('Only the owner can replace every wrap')

    if (!isOwner) {
      // A member may only seal boxes for other members of this group. The
      // recipient set is server-validated, so a member can never inject a box
      // for an outsider.
      const memberIds = new Set(
        ((group as unknown as { group_members: Array<{ user_id: string }> })?.group_members ?? []).map(
          (m) => m.user_id,
        ),
      )
      if (memberIds.size === 0) throw Errors.notFound('Group not found')
      for (const w of wraps) {
        if (!memberIds.has(w.user_id)) throw Errors.badRequest('Can only seal boxes for members of this group')
      }
    }

    if (replace) {
      // A rotation must never lock out silently: every member who HAS a
      // published identity key needs a box in the new generation. A member
      // with no key yet can't receive one — they're covered by cooperative
      // catch-up as soon as they provision, so they aren't a coverage gap.
      const members = ((group as unknown as { group_members: Array<{ user_id: string }> }).group_members ?? []).map(
        (m) => m.user_id,
      )
      const { data: profiles } = await c.var.userClient.from('profiles').select('id, enc_public_key').in('id', members)
      const keyed = new Set(
        (profiles ?? [])
          .filter((p) => (p as { enc_public_key: string | null }).enc_public_key)
          .map((p) => p.id as string),
      )
      const covered = new Set(wraps.map((w) => w.user_id))
      const uncovered = members.filter((m) => keyed.has(m) && !covered.has(m))
      if (uncovered.length > 0) throw Errors.badRequest('Sealed boxes must cover every member with a published key')

      const { error: delErr } = await c.var.userClient.from('group_key_wraps').delete().eq('group_id', id)
      if (delErr) throw fromPostgrestError(delErr)
    }

    const rows = wraps.map((w) => ({
      group_id: id,
      user_id: w.user_id,
      generation,
      sealed_box: w.sealed_box,
    }))

    const { error: insErr } = await c.var.userClient
      .from('group_key_wraps')
      .upsert(rows, { onConflict: 'group_id,user_id' })
    if (insErr) throw fromPostgrestError(insErr)

    return c.json({ wraps: wraps.map((w) => ({ user_id: w.user_id, generation, sealed_box: w.sealed_box })) })
  })

  const memberKeys = createRoute({
    method: 'get',
    path: '/groups/{id}/member-keys',
    tags: ['Encryption'],
    summary: 'Group members with identity keys and wrap status',
    description:
      'Every member with their published identity public key and whether they hold the group CEK yet. Drives cooperative coverage: any holder seals a box for a member who lacks one. (Distinct from /groups/{id}/members, the membership roster.)',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: GroupIdParam },
    responses: {
      ...errorResponses(401, 404, 503),
      200: {
        description: 'Members with their published identity public key and whether they hold the CEK yet',
        content: { 'application/json': { schema: z.object({ members: z.array(GroupMemberView) }) } },
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
    if (memberIds.length === 0) return c.json({ members: [] })

    const { data: profiles, error: pErr } = await c.var.userClient
      .from('profiles')
      .select('id, enc_public_key')
      .in('id', memberIds)
    if (pErr) throw fromPostgrestError(pErr)
    const keyOf = new Map(
      (profiles ?? []).map((p) => [p.id as string, (p as { enc_public_key: string | null }).enc_public_key]),
    )

    const { data: existingWraps, error: wErr } = await c.var.userClient
      .from('group_key_wraps')
      .select('user_id')
      .eq('group_id', id)
    if (wErr) throw fromPostgrestError(wErr)
    const wrappedIds = new Set((existingWraps ?? []).map((w) => w.user_id as string))

    const result = memberIds.map((uid) => ({
      user_id: uid,
      public_key: keyOf.get(uid) ?? null,
      has_wrap: wrappedIds.has(uid),
    }))
    return c.json({ members: result as Array<z.infer<typeof GroupMemberView>> })
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
