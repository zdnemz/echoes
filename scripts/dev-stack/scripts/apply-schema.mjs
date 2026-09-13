/**
 * Apply the dev-stack schema bootstrap to the local Postgres:
 *
 *   1. Supabase-style roles: anon / authenticated / service_role / authenticator
 *      with the same grant shape hosted Supabase uses (RLS stays the gate).
 *   2. auth.uid() helper if GoTrue's migrations haven't created it yet.
 *   3. The application migration (supabase/migrations/0001_init.sql) exactly
 *      once — tracked in a devstack.migrations marker table.
 *
 * Run via:  node scripts/dev-stack/scripts/apply-schema.mjs
 */
import pg from '../node_modules/pg/lib/index.js'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const stackDir = join(here, '..')

const pw = readFileSync(join(stackDir, 'tmp', '.pgpw'), 'utf8').trim()
const keys = JSON.parse(readFileSync(join(stackDir, '.keys.json'), 'utf8'))

const client = new pg.Client({
  host: '127.0.0.1',
  port: Number(process.env.PG_PORT ?? 5432),
  user: 'postgres',
  password: pw,
  database: 'postgres',
})

const log = (msg) => console.log('[schema] ' + msg)

// --- 1. roles + grants (idempotent) --------------------------------------------
const ROLES_SQL = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login password '${pw}' noinherit;
  end if;
end $$;

grant anon, authenticated, service_role to authenticator;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
`

// --- 2. auth.uid() (idempotent; normally already created by GoTrue) -------------
const AUTH_UID_SQL = `
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;
`

// --- main -----------------------------------------------------------------------
async function main() {
  await client.connect()
  log('connected to postgres')

  await client.query(ROLES_SQL)
  log('roles + grants ready (anon, authenticated, service_role, authenticator)')

  // Does the auth schema exist yet (GoTrue has booted at least once)?
  const { rows: authSchema } = await client.query("select 1 from pg_namespace where nspname = 'auth'")
  if (authSchema.length > 0) {
    await client.query(AUTH_UID_SQL)
    log('auth.uid() ensured')
  } else {
    log('WARNING: auth schema not present yet — run start-gotrue.sh first, then re-run this script')
  }

  // Marker table so each app migration applies exactly once.
  await client.query('create schema if not exists devstack')
  await client.query(
    'create table if not exists devstack.migrations (id text primary key, applied_at timestamptz not null default now())',
  )

  const migrationsDir = join(stackDir, '..', '..', 'supabase', 'migrations')
  if (!existsSync(migrationsDir)) throw new Error('missing migrations dir: ' + migrationsDir)
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const id = file.replace(/\.sql$/, '')
    const { rows } = await client.query('select 1 from devstack.migrations where id = $1', [id])
    if (rows.length > 0) {
      log(`${file} already applied — skipping`)
      continue
    }
    const sql = readFileSync(join(migrationsDir, file), 'utf8')
    await client.query('begin')
    try {
      await client.query(sql)
      await client.query('insert into devstack.migrations (id) values ($1)', [id])
      await client.query('commit')
      log(`${file} applied`)
    } catch (err) {
      await client.query('rollback')
      throw new Error(`${file}: ${err.message}`)
    }
  }

  // Post-application sanity: RLS actually enabled on every public table.
  const { rows: rls } = await client.query(`
    select tablename, rowsecurity from pg_tables
    where schemaname = 'public' order by tablename
  `)
  const noRls = rls.filter((r) => !r.rowsecurity)
  if (noRls.length > 0) {
    throw new Error('RLS missing on: ' + noRls.map((r) => r.tablename).join(', '))
  }
  log('RLS verified on all public tables: ' + rls.map((r) => r.tablename).join(', '))

  await client.end()
}

main().catch((err) => {
  console.error('[schema] FAILED:', err.message)
  process.exit(1)
})
