/**
 * Invite flow e2e: alex invites a brand-new email, that user signs up,
 * accepts the invite through the API, and gains group access — with the
 * RLS invite-gated membership policy doing the actual enforcement.
 */
const API = 'http://localhost:3000'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const login = async (email) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123!' }),
    })
    const body = await res.json()
    if (res.status === 429) {
      const secs = parseInt(body.details?.retry_after?.[0] ?? '5', 10) || 5
      console.log(`[login ${email}] rate limited, waiting ${secs}s…`)
      await sleep(secs * 1000 + 200)
      continue
    }
    console.log(`[login ${email}] status=${res.status}`, body.error ? JSON.stringify(body.error) : 'ok')
    return body
  }
  throw new Error('login kept getting rate limited')
}

const post = async (path, token, body) => {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

const alex = await login('alex@example.com')

// 1. alex's groups
const groupsRes = await fetch(`${API}/api/groups`, { headers: { Authorization: `Bearer ${alex.access_token}` } })
const groups = await groupsRes.json()
console.log(
  '[groups] status=',
  groupsRes.status,
  Array.isArray(groups) ? 'array' : JSON.stringify(groups).slice(0, 150),
)
const family = groups.find((g) => g.name === 'Family')
const RUN = Date.now().toString(36)
const email = `nina+${RUN}@example.com`
console.log('group found:', family.name, family.id.slice(0, 8))

// 2. create invite for a new user
const invite = await post(`/api/groups/${family.id}/invites`, alex.access_token, {
  email,
})
console.log(
  'invite created:',
  invite.status,
  'status:',
  invite.body.data?.status ?? invite.body.status ?? invite.body.error?.code,
  '| token:',
  (invite.body.data?.token ?? invite.body.token ?? '').slice(0, 12) + '…',
)
const token = invite.body.data?.token ?? invite.body.token ?? ''

// 3. nina signs up (retry past the auth rate limiter if needed)
let nina = null
for (let attempt = 0; attempt < 5 && !nina?.access_token; attempt++) {
  const signupRes = await fetch(`${API}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'Password123!', display_name: 'Nina Torres' }),
  })
  nina = await signupRes.json()
  console.log('signup:', signupRes.status, '| session issued:', Boolean(nina.access_token))
  if (signupRes.status === 429) {
    const secs = parseInt(nina.details?.retry_after?.[0] ?? '5', 10) || 5
    await sleep(secs * 1000 + 200)
  }
}

// 4. nina accepts the invite
const accept = await post(`/api/invites/${token}/accept`, nina.access_token, {})
console.log('accept:', accept.status, JSON.stringify(accept.body).slice(0, 120))

// 5. nina now sees the Family group + the shared notebook
const nbRaw = await (
  await fetch(`${API}/api/notebooks`, { headers: { Authorization: `Bearer ${nina.access_token}` } })
).json()
console.log('nina notebooks raw:', JSON.stringify(nbRaw).slice(0, 200))
const ninaNbs = nbRaw.data ?? nbRaw
console.log('nina notebooks:', ninaNbs.map((n) => n.title).join(', '))
const ninaGroups = await (
  await fetch(`${API}/api/groups`, { headers: { Authorization: `Bearer ${nina.access_token}` } })
).json()
console.log('nina groups:', ninaGroups.map((g) => g.name).join(', '))

// 6. double-accept must fail (single-use invite)
const again = await post(`/api/invites/${token}/accept`, nina.access_token, {})
console.log('re-accept status:', again.status, '(must not be 200)')

const passed =
  invite.status === 201 &&
  Boolean(nina?.access_token) &&
  nina.access_token &&
  accept.status === 200 &&
  ninaNbs.some((n) => n.title === 'Morning Pages') &&
  !ninaNbs.some((n) => n.title === 'Dreams') &&
  ninaGroups.some((g) => g.name === 'Family') &&
  again.status !== 200

console.log(passed ? 'INVITE E2E PASSED' : 'INVITE E2E FAILED')
process.exit(passed ? 0 : 1)
