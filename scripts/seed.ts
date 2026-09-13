/**
 * Seed script — creates demo data in the configured Supabase project.
 *
 *   bun run db:seed
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env (the service
 * role bypasses RLS, which is what seeding needs).
 *
 * Creates (idempotently):
 *   - 2 auth users:  alex@example.com / Password123!  (notebook owner)
 *                    sam@example.com  / Password123!  (group member)
 *   - profiles for both
 *   - 1 group "Family" owned by alex
 *   - 2 notebooks for alex: "Morning Pages" (linked to the group) + "Dreams" (private)
 *   - 5 tagged, mood-rated entries in Morning Pages (one with is_shared=false)
 *   - 1 accepted invite for sam + membership
 */

import { createClient } from '@supabase/supabase-js'

// --- load .env from the project root ---------------------------------------
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const envPath = join(process.cwd(), '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.\n' + 'Add them, then run: bun run db:seed')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const USERS = [
  { email: 'alex@example.com', password: 'Password123!', display_name: 'Alex Chen' },
  { email: 'sam@example.com', password: 'Password123!', display_name: 'Sam Rivera' },
] as const

async function ensureUser(email: string, password: string, displayName: string) {
  // Exists already? (search by email through the admin REST endpoint)
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?search=${encodeURIComponent(email)}&perPage=100`, {
    headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY!}` },
  })
  if (res.ok) {
    const body = (await res.json()) as { users?: Array<{ id: string; email?: string | null }> }
    const found = (body.users ?? []).find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase())
    if (found) {
      // Ensure the profile exists (trigger should have made it, but be safe).
      await db.from('profiles').upsert({ id: found.id, display_name: displayName }).eq('id', found.id)
      return found.id
    }
  }

  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  })
  if (error || !data.user) {
    console.error(`Failed to create user ${email}:`, error?.message)
    process.exit(1)
  }
  return data.user.id
}

async function main() {
  console.log('Seeding journaling demo data…\n')

  // ---------------------------------------------------------------- users
  const alexId = await ensureUser(USERS[0].email, USERS[0].password, USERS[0].display_name)
  const samId = await ensureUser(USERS[1].email, USERS[1].password, USERS[1].display_name)
  console.log(`✓ users: alex (${alexId.slice(0, 8)}…), sam (${samId.slice(0, 8)}…)`)

  // ---------------------------------------------------------------- group
  const { data: existingGroup } = await db
    .from('groups')
    .select('id')
    .eq('owner_id', alexId)
    .eq('name', 'Family')
    .maybeSingle()
  let groupId = existingGroup?.id
  if (!groupId) {
    const { data: group, error } = await db
      .from('groups')
      .insert({ owner_id: alexId, name: 'Family' })
      .select('id')
      .single()
    if (error || !group) {
      console.error('Failed to create group:', error?.message)
      process.exit(1)
    }
    groupId = group.id
  }
  await db.from('group_members').upsert({ group_id: groupId, user_id: alexId, role: 'owner' })
  await db.from('group_members').upsert({ group_id: groupId, user_id: samId, role: 'member' })
  console.log(`✓ group "Family" (${groupId.slice(0, 8)}…) with alex (owner) + sam (member)`)

  // ---------------------------------------------------------------- notebooks
  const { data: existingNb } = await db
    .from('notebooks')
    .select('id, group_id')
    .eq('owner_id', alexId)
    .eq('title', 'Morning Pages')
    .maybeSingle()
  let notebookId: string
  if (existingNb) {
    notebookId = existingNb.id
    if (existingNb.group_id !== groupId) {
      await db.from('notebooks').update({ group_id: groupId }).eq('id', notebookId)
    }
  } else {
    const { data: nb, error } = await db
      .from('notebooks')
      .insert({ owner_id: alexId, title: 'Morning Pages', group_id: groupId })
      .select('id')
      .single()
    if (error || !nb) {
      console.error('Failed to create notebook:', error?.message)
      process.exit(1)
    }
    notebookId = nb.id
  }
  const { data: dreamNb } = await db
    .from('notebooks')
    .select('id')
    .eq('owner_id', alexId)
    .eq('title', 'Dreams')
    .maybeSingle()
  if (!dreamNb) {
    await db.from('notebooks').insert({ owner_id: alexId, title: 'Dreams', group_id: null })
  }
  console.log(`✓ notebooks: "Morning Pages" (shared with Family, ${notebookId.slice(0, 8)}…) + "Dreams" (private)`)

  // ---------------------------------------------------------------- entries
  const entries = [
    {
      notebook_id: notebookId,
      author_id: alexId,
      title: 'A slow morning',
      body: 'Woke up early, the coffee was **excellent**. Sat by the window and wrote three pages without stopping once.',
      mood: 'great',
      tags: ['morning', 'gratitude'],
      is_shared: true,
    },
    {
      notebook_id: notebookId,
      author_id: alexId,
      title: 'Long walk after rain',
      body: 'Everything smelled like wet earth. Noticed how loud the city gets when it finally quiets down.',
      mood: 'good',
      tags: ['walk', 'city'],
      is_shared: true,
    },
    {
      notebook_id: notebookId,
      author_id: alexId,
      title: 'Deadline nerves',
      body: 'The launch is on Friday and my brain keeps rehearsing everything that could go wrong. Made a list; the list helped.',
      mood: 'low',
      tags: ['work', 'anxiety'],
      is_shared: true,
    },
    {
      notebook_id: notebookId,
      author_id: alexId,
      title: 'Dinner with Sam',
      body: 'We cooked pasta and argued about films again. Same argument, different year. I would not change a thing.',
      mood: 'good',
      tags: ['friends', 'food'],
      is_shared: true,
    },
    {
      notebook_id: notebookId,
      author_id: alexId,
      title: 'Private note — not for the group',
      body: 'This one stays with me. Opted out of sharing to test the per-entry privacy toggle.',
      mood: 'okay',
      tags: ['private'],
      is_shared: false,
    },
  ]

  const { count: entryCount } = await db
    .from('entries')
    .select('id', { count: 'exact', head: true })
    .eq('notebook_id', notebookId)
  if ((entryCount ?? 0) === 0) {
    const { error: entriesError } = await db.from('entries').insert(entries)
    if (entriesError) {
      console.error('Failed to insert entries:', entriesError.message)
      process.exit(1)
    }
    console.log('✓ entries: 5 in "Morning Pages" (moods, tags; one opted out of sharing)')
  } else {
    console.log(`✓ entries already present (${entryCount}), skipping`)
  }

  // ---------------------------------------------------------------- invite link
  // Leave the demo group linkless (owners create links from the UI); sam is
  // already a member via the upsert above.
  console.log('✓ invite link left unset (create one from the group sharing panel)')

  console.log('\nDone. Try it:')
  console.log('  curl -X POST <app>/api/auth/login -H "content-type: application/json" \\')
  console.log(`       -d '{"email":"alex@example.com","password":"Password123!"}'`)
  console.log('  → use the returned access_token as the Bearer token')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
