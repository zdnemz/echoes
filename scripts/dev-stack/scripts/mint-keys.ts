/**
 * Mint the Supabase-style JWT keys (anon + service_role) for the local dev
 * stack, signed with the stack's shared HS256 secret.
 *
 * PostgREST switches to the JWT's `role` claim per request (anon /
 * authenticated / service_role) and GoTrue grants admin access to tokens
 * whose role is `service_role` — which is exactly how hosted Supabase keys
 * behave, just minted locally.
 *
 * Output: scripts/dev-stack/.keys.json  (gitignored)
 */
import { createHmac, randomBytes } from 'node:crypto'
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const stackDir = join(here, '..')
const secretsPath = join(stackDir, '.keys.json')

// Secret: generate once, keep stable across restarts so long-lived tokens
// (and the .env keys) stay valid while the cluster survives.
let secret: string
if (existsSync(secretsPath)) {
  secret = JSON.parse(readFileSync(secretsPath, 'utf8')).secret
} else {
  secret = randomBytes(48).toString('hex') // 96 hex chars, HS256-safe
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function mint(role: string): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const now = Math.floor(Date.now() / 1000)
  const payload = b64url(
    JSON.stringify({
      role,
      iss: 'echoes-dev-stack',
      iat: now,
      exp: now + 10 * 365 * 24 * 3600, // 10 years — dev stack convenience
    }),
  )
  const sig = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${sig}`
}

const keys = {
  secret,
  anon_key: mint('anon'),
  service_role_key: mint('service_role'),
}

mkdirSync(stackDir, { recursive: true })
writeFileSync(secretsPath, JSON.stringify(keys, null, 2) + '\n', { mode: 0o600 })
console.log('anon key:         ' + keys.anon_key.slice(0, 24) + '…')
console.log('service_role key: ' + keys.service_role_key.slice(0, 24) + '…')
console.log(`written: ${secretsPath}`)
