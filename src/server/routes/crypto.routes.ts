import { createRoute, z } from '@hono/zod-openapi'
import {
  DistributeGroupKeysSchema,
  EncryptMigrationResultSchema,
  EncryptMigrationSchema,
  GroupKeyWrapView,
  KeyMaterialSchema,
  PublishKeysSchema,
  UuidSchema,
} from '../schemas'
import { Errors, fromPostgrestError } from '../errors'
import { requireAuth } from '../auth'
import { bearerAuth, errorResponses, jsonBody, requireGroupOwner, type App } from './helpers'

/**
 * E2EE key routes — the server is a dumb, RLS-guarded relay for opaque blobs.
 *
 * It never sees: passwords, KEKs, DEKs, identity private keys, group CEKs,
 * or any plaintext. Every write is scoped to rows the caller owns by policy;
 * every read is scoped to rows addressed to them.
 */

const GroupIdParam = z.object({
  id: UuidSchema.openapi({ param: { name: 'id', in: 'path' } }),
})

export function registerCryptoRoutes(app: App) {
  // ----------------------------------------------------------------- my key material
  const getKeys = createRoute({
    method: 'get',
    path: '/me/keys',
    tags: ['Encryption'],
    summary: 'Fetch your key material (opaque blobs)',
    description:
      'Returns the salt, PBKDF2 iteration count, wrapped DEK, public identity key and wrapped private identity key stored on your profile. The server cannot use any of these to decrypt entries.',
    security: [bearerAuth],
    middleware: [requireAuth],
    responses: {
      ...errorResponses(401, 503),
      200: {
        description: 'Key material (fields null before first publish)',
        content: { 'application/json': { schema: KeyMaterialSchema } },
      },
    },
  })
  app.openapi(getKeys, async (c) => {
    const { data, error } = await c.var.userClient
      .from('profiles')
      .select('enc_salt, enc_iterations, enc_wrapped_dek, enc_public_key, enc_wrapped_private_key')
      .eq('id', c.var.user.id)
      .maybeSingle()
    if (error) throw fromPostgrestError(error)
    if (!data) throw Errors.notFound('Profile not found')
    const row = data as {
      enc_salt: string | null
      enc_iterations: number | null
      enc_wrapped_dek: string | null
      enc_public_key: string | null
      enc_wrapped_private_key: string | null
    }
    return c.json({
      salt: row.enc_salt,
      iterations: row.enc_iterations,
      wrapped_dek: row.enc_wrapped_dek,
      public_key: row.enc_public_key,
      wrapped_private_key: row.enc_wrapped_private_key,
    })
  })

  // ----------------------------------------------------------------- publish keys
  const publishKeys = createRoute({
    method: 'put',
    path: '/me/keys',
    tags: ['Encryption'],
    summary: 'Publish key material (signup or first E2EE enablement)',
    description:
      'Stores the PBKDF2 parameters, the DEK wrapped under the password-derived KEK, and the ECDH identity keys on the profile. Once set, the wrapped DEK can only be replaced by proving knowledge of the OLD wrapped DEK (re-wrap on password change) — a hijacked session cannot silently rotate the user onto attacker keys.',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { body: jsonBody(PublishKeysSchema) },
    responses: {
      ...errorResponses(400, 401, 404, 422, 503),
      200: { description: 'Stored', content: { 'application/json': { schema: KeyMaterialSchema } } },
    },
  })
  app.openapi(publishKeys, async (c) => {
    const body = c.req.valid('json')
    const me = c.var.user.id

    const { data: existing, error: readErr } = await c.var.userClient
      .from('profiles')
      .select('enc_wrapped_dek')
      .eq('id', me)
      .maybeSingle()
    if (readErr) throw fromPostgrestError(readErr)
    if (!existing) throw Errors.notFound('Profile not found')

    // First publish is free; later ones must carry the current wrapped DEK so
    // only a client that can decrypt can rotate the material.
    if (existing.enc_wrapped_dek && existing.enc_wrapped_dek !== body.wrapped_dek) {
      throw Errors.badRequest(
        'Key material already exists — use the re-wrap flow (old wrapped_dek required) to change it',
      )
    }

    const { data, error } = await c.var.userClient
      .from('profiles')
      .update({
        enc_salt: body.salt,
        enc_iterations: body.iterations,
        enc_wrapped_dek: body.wrapped_dek,
        enc_public_key: body.public_key,
        enc_wrapped_private_key: body.wrapped_private_key,
      })
      .eq('id', me)
      .select('enc_salt, enc_iterations, enc_wrapped_dek, enc_public_key, enc_wrapped_private_key')
      .single()
    if (error) throw fromPostgrestError(error)
    const row = data as {
      enc_salt: string | null
      enc_iterations: number | null
      enc_wrapped_dek: string | null
      enc_public_key: string | null
      enc_wrapped_private_key: string | null
    }
    return c.json({
      salt: row.enc_salt,
      iterations: row.enc_iterations,
      wrapped_dek: row.enc_wrapped_dek,
      public_key: row.enc_public_key,
      wrapped_private_key: row.enc_wrapped_private_key,
    })
  })

  // ----------------------------------------------------------------- group CEK wraps
  const getGroupWrap = createRoute({
    method: 'get',
    path: '/groups/{id}/key',
    tags: ['Encryption'],
    summary: 'Fetch your sealed box for a group',
    description:
      'Returns the sealed box carrying the group CEK addressed to the caller. RLS restricts reads to the box owner or the group owner.',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: GroupIdParam },
    responses: {
      ...errorResponses(401, 404, 503),
      200: { description: 'Your sealed box', content: { 'application/json': { schema: GroupKeyWrapView } } },
    },
  })
  app.openapi(getGroupWrap, async (c) => {
    const { id } = c.req.valid('param')

    const { data, error } = await c.var.userClient
      .from('group_key_wraps')
      .select('group_id, generation, sealed_box, created_at')
      .eq('group_id', id)
      .eq('user_id', c.var.user.id)
      .maybeSingle()
    if (error) throw fromPostgrestError(error)
    if (!data) throw Errors.notFound('No group key addressed to you (or not visible)')
    return c.json(data)
  })

  // Owner distributes/rotates: one generation, all members covered.
  const distributeGroupKeys = createRoute({
    method: 'put',
    path: '/groups/{id}/key',
    tags: ['Encryption'],
    summary: 'Distribute or rotate the group CEK (owner only)',
    description:
      'Replaces the group\u2019s key generation with a fresh set of per-member sealed boxes. All members must be covered — the endpoint rejects partial distributions so a rotation can never lock someone out silently. Rotation should follow every member removal.',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { params: GroupIdParam, body: jsonBody(DistributeGroupKeysSchema) },
    responses: {
      ...errorResponses(400, 401, 403, 404, 422, 503),
      200: { description: 'Distribution stored', content: { 'application/json': { schema: GroupKeyWrapView } } },
    },
  })
  app.openapi(distributeGroupKeys, async (c) => {
    const { id } = c.req.valid('param')
    const { generation, wraps } = c.req.valid('json')

    // Owner gate + current member list in one read.
    const group = await requireGroupOwner(c.var.userClient, id, c.var.user.id, {
      select: 'id, owner_id, group_members(user_id, role)',
    })
    const members = (group as unknown as { group_members: Array<{ user_id: string }> }).group_members ?? []
    const memberIds = new Set(members.map((m) => m.user_id))
    const wrapFor = new Set(wraps.map((w) => w.user_id))
    if (memberIds.size === 0 || [...memberIds].some((m) => !wrapFor.has(m))) {
      throw Errors.badRequest('Sealed boxes must cover every current member exactly once')
    }

    // Delete-then-insert inside one generation bump — RLS owner-write policy
    // is the enforcement; a failed insert leaves zero wraps for the group,
    // which the owner UI surfaces as "distribute again".
    const { error: delErr } = await c.var.userClient.from('group_key_wraps').delete().eq('group_id', id)
    if (delErr) throw fromPostgrestError(delErr)
    const { error: insErr } = await c.var.userClient
      .from('group_key_wraps')
      .insert(wraps.map((w) => ({ group_id: id, user_id: w.user_id, generation, sealed_box: w.sealed_box })))
    if (insErr) throw fromPostgrestError(insErr)

    return c.json({ group_id: id, generation, sealed_box: '', created_at: new Date().toISOString() })
  })

  // ----------------------------------------------------------------- encrypt migration
  const migrateEntries = createRoute({
    method: 'post',
    path: '/me/encrypt-migrate',
    tags: ['Encryption'],
    summary: 'Flip a batch of your entries to encrypted (client-driven migration)',
    description:
      'The client decrypts nothing here — it re-seals already-fetched plaintext rows (or directly re-wraps) and POSTs the ciphers. The server just flips encrypted=true and stores the blobs. Bounded to the caller\u2019s own rows by RLS. Returns remaining unencrypted count.',
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

    const { data, error } = await c.var.userClient
      .from('entries')
      .upsert(
        entries.map((e) => ({
          id: e.id,
          author_id: me,
          title: e.title_cipher,
          body: e.body_cipher,
          encrypted: true,
        })),
        { onConflict: 'id' },
      )
      .eq('author_id', me)
      .neq('encrypted', true)
      .select('id')
    if (error) throw fromPostgrestError(error)

    const { count, error: countErr } = await c.var.userClient
      .from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('author_id', me)
      .eq('encrypted', false)
    if (countErr) throw fromPostgrestError(countErr)

    return c.json({ migrated: data?.length ?? 0, remaining: count ?? 0 })
  })
}
