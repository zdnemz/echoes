/**
 * Account-key E2E — proves the two bugs this change fixes, against the live
 * stack, using the REAL client crypto modules (vault.ts / group-keys.ts /
 * entry-codec.ts), not a reimplementation:
 *
 *   A. Device change, same account → still reads every entry. (was: new
 *      device minted fresh keys and was locked out of its own history.)
 *   B. Group members read each other's entries, including a save that raced
 *      ahead of the key distribution. (was: author-only saves stayed
 *      unreadable by everyone but the author, forever.)
 *
 * Run with the stack up:  bun scripts/dev-stack/scripts/e2e-account-keys.ts
 */

// The client modules read the token from window.localStorage under Bun; shim
// it so this script drives the same code the browser does.
const store = new Map<string, string>()
;(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  },
}

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const envPath = join(process.cwd(), '.env')
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const API = process.env.API_URL ?? 'http://localhost:3000'

// The client fetches relative paths (the browser resolves them); resolve them
// here so the same client code runs under Bun.
const rawFetch = globalThis.fetch
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' && input.startsWith('/api') ? `${API}${input}` : input
  return rawFetch(url as RequestInfo | URL, init)
}) as typeof globalThis.fetch

const SUPABASE_URL = process.env.SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const authed = (token: string) => ({ Authorization: `Bearer ${token}`, 'content-type': 'application/json' })

let failures = 0
const check = (label: string, ok: boolean, extra = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures++
}

// ------------------------------------------------------------------ users
async function login(email: string): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123!' }),
    })
    const body = await res.json()
    if (res.status === 429) {
      await sleep((parseInt(body.details?.retry_after?.[0] ?? '3', 10) || 3) * 1000 + 300)
      continue
    }
    if (!body.access_token) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(body)}`)
    return body.access_token as string
  }
  throw new Error(`login rate-limited for ${email}`)
}

const { setToken } = await import('@/lib/api/client')
const {
  provisionKeys,
  unlockWithPin,
  lock,
  forgetGroupCek,
  getGroupCek,
  ensureMemberCoverage,
  distributeOrRotate,
  ensureShareableCek,
  coverMyGroups,
} = await import('@/lib/crypto/vault')
const { sealForStorage, openFromStorage } = await import('@/lib/crypto/entry-codec')
const { createEntry, getEntry } = await import('@/lib/api/endpoints')

/** The create response omits the wraps; re-fetch the full row to read them. */
const full = async (id: string) => getEntry(id)

const RUN = Date.now().toString(36)
const alexEmail = `alex+${RUN}@example.com`
const samEmail = `sam+${RUN}@example.com`

async function ensureUser(email: string, displayName: string): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: 'Password123!',
    email_confirm: true,
    user_metadata: { display_name: displayName },
  })
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`)
  return data.user.id
}

async function main() {
  const alexId = await ensureUser(alexEmail, 'Alex')
  const samId = await ensureUser(samEmail, 'Sam')
  console.log(`users: alex(${alexId.slice(0, 8)}) sam(${samId.slice(0, 8)})`)

  // Shared fixture: a group + a notebook linked to it, owned by alex.
  const { data: group } = await db
    .from('groups')
    .insert({ owner_id: alexId, name: `Family-${RUN}` })
    .select('id')
    .single()
  const { data: nb } = await db
    .from('notebooks')
    .insert({ owner_id: alexId, title: `Morning Pages-${RUN}`, group_id: group!.id })
    .select('id')
    .single()
  await db.from('group_members').upsert({ group_id: group!.id, user_id: alexId, role: 'owner' })
  await db.from('group_members').upsert({ group_id: group!.id, user_id: samId, role: 'member' })
  // Each member writes in a notebook they own; linking both to the group is
  // what makes the two streams one shared journal.
  const { data: samNb } = await db
    .from('notebooks')
    .insert({ owner_id: samId, title: `Sam Pages-${RUN}`, group_id: group!.id })
    .select('id')
    .single()
  console.log(`group ${group!.id.slice(0, 8)} notebook ${nb!.id.slice(0, 8)}`)

  const alexToken = await login(alexEmail)
  const samToken = await login(samEmail)

  /** Switch the global vault to one account (it's a module singleton). */
  async function asUser(token: string, pin: string | null, email: string): Promise<void> {
    setToken(token)
    lock()
    forgetGroupCek(group!.id)
    if (pin) await unlockWithPin(pin)
    else {
      const { ensureKeys } = await import('@/lib/crypto/vault')
      await ensureKeys()
    }
    console.log(`  [switched to ${email}]`)
  }

  // =====================================================================
  console.log('\nA. Device change with the same account')
  // A1 — first device: choose a PIN, publish the bundle.
  await asUser(alexToken, null, 'alex')
  await provisionKeys('1234')
  check('PIN published a key bundle', true)

  // A2 — write a private encrypted entry on this device.
  const privateBody = `Private thought ${RUN} — nobody else should read this.`
  const sealedPrivate = await sealForStorage('Private', privateBody, null, false)
  const created = await full(
    (
      await createEntry(nb!.id, {
        title: sealedPrivate.title,
        body: sealedPrivate.body,
        encrypted: true,
        key_wraps: sealedPrivate.key_wraps,
      })
    ).id,
  )
  check('private entry created (sealed)', created.encrypted === true)

  // A3 — the database holds ciphertext only.
  const { data: cipherRow } = await db.from('entries').select('body').eq('id', created.id).single()
  check(
    'DB stores ciphertext, not plaintext',
    cipherRow?.body?.startsWith('v1.') === true,
    cipherRow?.body.slice(0, 12),
  )

  // A4 — NEW DEVICE: keys live only in memory, so dropping them + re-unlocking
  //      with the PIN is exactly the second-browser path.
  lock()
  forgetGroupCek(group!.id)
  setToken(alexToken) // same account, fresh browser profile
  await unlockWithPin('1234')
  const reopened = await openFromStorage(created, alexId, null)
  check('new device reads its own entry with the PIN', reopened.body === privateBody)

  // A5 — a wrong PIN fails closed.
  lock()
  forgetGroupCek(group!.id)
  let wrongPinThrew = false
  try {
    await unlockWithPin('0000')
  } catch {
    wrongPinThrew = true
  }
  check('wrong PIN fails closed', wrongPinThrew)
  await unlockWithPin('1234')

  // =====================================================================
  console.log('\nB. Group members read each other')

  // B1 — alex distributes the group key.
  await asUser(alexToken, '1234', 'alex')
  await distributeOrRotate(group!.id, alexId)
  const alexSharedBody = `Alex's shared note ${RUN}`
  const sealedShared = await sealForStorage('Shared', alexSharedBody, group!.id, true)
  const shared = await full(
    (
      await createEntry(nb!.id, {
        title: sealedShared.title,
        body: sealedShared.body,
        is_shared: true,
        encrypted: true,
        key_wraps: sealedShared.key_wraps,
      })
    ).id,
  )
  check(
    "alex's shared entry has a group wrap",
    (shared.key_wraps ?? []).some((w) => w.scope === 'group'),
  )

  // B2 — sam (new account, own device/PIN) reads alex's entry. Sam can't seal
  // a box for themselves — only a holder can — so alex (a holder) opens the
  // group first, which seals sam a box via cooperative coverage.
  await asUser(samToken, null, 'sam')
  await provisionKeys('5678')
  await asUser(alexToken, '1234', 'alex')
  await ensureMemberCoverage(group!.id, alexId)
  await asUser(samToken, '5678', 'sam')
  const samCek = await getGroupCek(group!.id)
  check('sam obtained the group CEK', samCek !== null)
  const samReadsAlex = await openFromStorage(shared, samId, group!.id)
  check("sam reads alex's shared entry", samReadsAlex.body === alexSharedBody)

  // B3 — sam writes a shared entry; alex reads it.
  const samBody = `Sam's shared note ${RUN}`
  const sealedSam = await sealForStorage('From Sam', samBody, group!.id, true)
  const samEntry = await full(
    (
      await createEntry(samNb!.id, {
        title: sealedSam.title,
        body: sealedSam.body,
        is_shared: true,
        encrypted: true,
        key_wraps: sealedSam.key_wraps,
      })
    ).id,
  )
  await asUser(alexToken, '1234', 'alex')
  const alexReadsSam = await openFromStorage(samEntry, alexId, group!.id)
  check('alex reads sam’s shared entry', alexReadsSam.body === samBody)

  // B4 — the hard case: sam saves while holding NO box (key distribution raced
  //      ahead). The entry lands author-only; a holder's next visit must seal
  //      sam a box AND back-fill the group wrap onto sam's entry.
  await db.from('group_key_wraps').delete().eq('group_id', group!.id).eq('user_id', samId)
  await asUser(samToken, '5678', 'sam')
  const racedBody = `Sam's raced save ${RUN}`
  const racedSeal = await sealForStorage('Raced', racedBody, group!.id, true)
  check('raced save degraded to author-only', racedSeal.shareState === 'author-only')
  const raced = await full(
    (
      await createEntry(samNb!.id, {
        title: racedSeal.title,
        body: racedSeal.body,
        is_shared: true, // visible-but-pending so it can heal
        encrypted: true,
        key_wraps: racedSeal.key_wraps,
      })
    ).id,
  )

  // Alex (a holder) opens the group → cooperative coverage seals sam a box.
  // Alex can only back-fill his OWN author-only entries; sam's raced entry
  // heals when sam — now holding the CEK — next opens the group.
  await asUser(alexToken, '1234', 'alex')
  await ensureMemberCoverage(group!.id, alexId)
  const { data: samBox } = await db
    .from('group_key_wraps')
    .select('user_id')
    .eq('group_id', group!.id)
    .eq('user_id', samId)
    .maybeSingle()
  check('coverage re-sealed a box for sam', Boolean(samBox))

  await asUser(samToken, '5678', 'sam')
  await ensureMemberCoverage(group!.id, samId)

  const { data: racedRow } = await db.from('entry_key_wraps').select('scope').eq('entry_id', raced.id)
  const scopes = (racedRow ?? []).map((r) => r.scope)
  check("sam's raced entry gained a group wrap", scopes.includes('group'), JSON.stringify(scopes))

  // Sam comes back and reads alex's entries via the recovered CEK; alex reads
  // sam's now-healed entry.
  await asUser(samToken, '5678', 'sam')
  const samCekAgain = await getGroupCek(group!.id)
  check('sam recovered the CEK from the new box', samCekAgain !== null)
  const samReread = await openFromStorage(shared, samId, group!.id)
  check('sam still reads alex after the catch-up', samReread.body === alexSharedBody)

  await asUser(alexToken, '1234', 'alex')
  const healed = await full(raced.id)
  const alexReadsRaced = await openFromStorage(healed, alexId, group!.id)
  check('alex reads sam’s raced entry after the heal', alexReadsRaced.body === racedBody)

  // =====================================================================
  console.log('\nC. Proactive coverage (the UI gap)')
  // Sam's box is dropped again. Nobody visits the group view; alex simply
  // signs back in — the unlock path covers every group, resealing sam's box.
  await db.from('group_key_wraps').delete().eq('group_id', group!.id).eq('user_id', samId)
  await asUser(alexToken, '1234', 'alex')
  await coverMyGroups(alexId)
  const { data: samBox2 } = await db
    .from('group_key_wraps')
    .select('user_id')
    .eq('group_id', group!.id)
    .eq('user_id', samId)
    .maybeSingle()
  check('unlock-time coverage resealed sam’s box', Boolean(samBox2))

  // And the save path covers too: drop the box once more, alex saves (the
  // editor now tops up boxes for missing members after securing the CEK),
  // and a freshly-switched sam reads the new entry with no manual coverage.
  await db.from('group_key_wraps').delete().eq('group_id', group!.id).eq('user_id', samId)
  await asUser(alexToken, '1234', 'alex')
  const lateCek = await ensureShareableCek(group!.id, alexId)
  if (lateCek) await ensureMemberCoverage(group!.id, alexId)
  const lateBody = `Alex's late note ${RUN}`
  const sealedLate = await sealForStorage('Late', lateBody, group!.id, true)
  const late = await full(
    (
      await createEntry(nb!.id, {
        title: sealedLate.title,
        body: sealedLate.body,
        is_shared: true,
        encrypted: true,
        key_wraps: sealedLate.key_wraps,
      })
    ).id,
  )
  await asUser(samToken, '5678', 'sam')
  const samReadsLate = await openFromStorage(late, samId, group!.id)
  check('sam reads an entry saved after save-time coverage', samReadsLate.body === lateBody)

  // =====================================================================
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  // Wrap so stdout flushes before exit (an uncaught throw drops the buffer).
  console.error('\nSCRIPT FAILED:', err)
  process.exit(2)
})
