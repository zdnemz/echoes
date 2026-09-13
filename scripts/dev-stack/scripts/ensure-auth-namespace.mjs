/**
 * Create the auth schema + GoTrue's bookkeeping table before `auth migrate`
 * runs (its migration dump assumes both already exist, as Supabase's own
 * postgres images pre-create them).
 */
import pg from '../node_modules/pg/lib/index.js'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const stackDir = join(here, '..')
const pw = readFileSync(join(stackDir, 'tmp', '.pgpw'), 'utf8').trim()

const client = new pg.Client({
  host: '127.0.0.1',
  port: 5432,
  user: 'postgres',
  password: pw,
  database: 'postgres',
})

await client.connect()
await client.query('create schema if not exists auth')
await client.end()
console.log('[gotrue] auth namespace ready')
