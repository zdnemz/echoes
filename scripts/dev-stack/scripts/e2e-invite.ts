/**
 * Invite-link flow e2e: alex opens link-joining on Family, nina joins
 * instantly; then manual mode — theo files a request, alex approves it;
 * finally the revoked link stops working.
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

const authed = (token) => ({ Authorization: `Bearer ${token}`, 'content-type': 'application/json' })

const signup = async (email, displayName) => {
  let out = null
  for (let attempt = 0; attempt < 5 && !out?.access_token; attempt++) {
    const res = await fetch(`${API}/api/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'Password123!', display_name: displayName }),
    })
    out = await res.json()
    console.log(`[signup ${email}] status=${res.status} session=${Boolean(out.access_token)}`)
    if (res.status === 429) {
      const secs = parseInt(out.details?.retry_after?.[0] ?? '5', 10) || 5
      await sleep(secs * 1000 + 200)
    }
  }
  return out
}

const tokenFromUrl = (url) => new URL(url, API).searchParams.get('token') ?? ''

const alex = await login('alex@example.com')
const groups = await (await fetch(`${API}/api/groups`, { headers: authed(alex.access_token) })).json()
const family = groups.find((g) => g.name === 'Family')
console.log('group found:', family.name, family.id.slice(0, 8))
const RUN = Date.now().toString(36)

// 1. auto-accept on + fresh link
const patchOn = await fetch(`${API}/api/groups/${family.id}`, {
  method: 'PATCH',
  headers: authed(alex.access_token),
  body: JSON.stringify({ auto_accept: true }),
})
console.log('auto-accept on status:', patchOn.status, '(must be 200)')
const link = await (
  await fetch(`${API}/api/groups/${family.id}/invite-link`, {
    method: 'POST',
    headers: authed(alex.access_token),
    body: JSON.stringify({ expires_in_hours: 24 }),
  })
).json()
const openToken = tokenFromUrl(link.url)
console.log('link created:', Boolean(openToken), '| auto_accept:', link.auto_accept)

// 2. nina joins instantly + sees the shared notebook (not the private one)
const nina = await signup(`nina+${RUN}@example.com`, 'Nina Torres')
const joined = await (
  await fetch(`${API}/api/invites/link/${openToken}/join`, {
    method: 'POST',
    headers: authed(nina.access_token),
  })
).json()
console.log('nina join:', joined.status)
const ninaNbs = (await (await fetch(`${API}/api/notebooks`, { headers: authed(nina.access_token) })).json()).data.map(
  (n) => n.title,
)
const again = await (
  await fetch(`${API}/api/invites/link/${openToken}/join`, {
    method: 'POST',
    headers: authed(nina.access_token),
  })
).json()
console.log('nina re-join:', again.status, '(idempotent)')

// 3. manual mode: rotate link, theo requests, alex approves
await fetch(`${API}/api/groups/${family.id}`, {
  method: 'PATCH',
  headers: authed(alex.access_token),
  body: JSON.stringify({ auto_accept: false }),
})
const link2 = await (
  await fetch(`${API}/api/groups/${family.id}/invite-link`, {
    method: 'POST',
    headers: authed(alex.access_token),
    body: JSON.stringify({ expires_in_hours: null }),
  })
).json()
const manualToken = tokenFromUrl(link2.url)
const theo = await signup(`theo+${RUN}@example.com`, 'Theo Park')
const theoMe = await (await fetch(`${API}/api/auth/me`, { headers: authed(theo.access_token) })).json()
const requested = await (
  await fetch(`${API}/api/invites/link/${manualToken}/join`, {
    method: 'POST',
    headers: authed(theo.access_token),
  })
).json()
console.log('theo join:', requested.status)
const queue = await (
  await fetch(`${API}/api/groups/${family.id}/requests`, { headers: authed(alex.access_token) })
).json()
console.log('queue:', queue.map((r) => `${r.display_name}:${r.status}`).join(', '))
const theoReq = queue.find((r) => r.user_id === theoMe.id && r.status === 'pending')
const approved = await (
  await fetch(`${API}/api/groups/${family.id}/requests/${theoReq.id}/approved`, {
    method: 'POST',
    headers: authed(alex.access_token),
  })
).json()
const theoGroups = await (await fetch(`${API}/api/groups`, { headers: authed(theo.access_token) })).json()
console.log('theo groups:', theoGroups.map((g) => g.name).join(', '))

// 4. revoked link dies
await fetch(`${API}/api/groups/${family.id}/invite-link`, {
  method: 'DELETE',
  headers: authed(alex.access_token),
})
const dead = await fetch(`${API}/api/invites/link/${manualToken}`)
console.log('revoked link info status:', dead.status, '(must be 404)')

// restore auto-accept default for the demo group
await fetch(`${API}/api/groups/${family.id}`, {
  method: 'PATCH',
  headers: authed(alex.access_token),
  body: JSON.stringify({ auto_accept: false }),
})

const passed =
  patchOn.status === 200 &&
  link.auto_accept === true &&
  joined.status === 'joined' &&
  ninaNbs.includes('Morning Pages') &&
  !ninaNbs.includes('Dreams') &&
  again.status === 'member' &&
  requested.status === 'requested' &&
  approved.status === 'approved' &&
  theoGroups.some((g) => g.name === 'Family') &&
  dead.status === 404

// Tidy up: remove the test users (memberships + requests cascade).
try {
  const { readFileSync } = await import('node:fs')
  const keys = JSON.parse(readFileSync('scripts/dev-stack/.keys.json', 'utf8'))
  for (const u of [nina, theo]) {
    const me = await (await fetch(`${API}/api/auth/me`, { headers: authed(u.access_token) })).json()
    await fetch(`http://127.0.0.1:54321/auth/v1/admin/users/${me.id}`, {
      method: 'DELETE',
      headers: { apikey: keys.service_role_key, Authorization: `Bearer ${keys.service_role_key}` },
    })
  }
  console.log('test users cleaned up')
} catch {
  /* best-effort only */
}

console.log(passed ? 'INVITE E2E PASSED' : 'INVITE E2E FAILED')
process.exit(passed ? 0 : 1)
