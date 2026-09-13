# Echoes dev stack — local Supabase, zero credentials

A self-contained, Supabase-compatible backend that runs entirely on this
machine, so the full product (auth, RLS, data API)
works **before** any cloud credentials exist.

```
           ┌───────────────── app ─────────────────┐
           │  Next.js :3000                        │
           └───────┬───────────────────────────────┘
                   │ SUPABASE_URL
                   ▼
        gateway :54321  ──►  PostgREST :5998  ──►  Postgres :5432
        (single origin)      (REST + RLS)          (RLS policies)
             └──►  GoTrue :5999  ──►  auth.users (JWT, sessions)
```

- **Postgres 17** (`@embedded-postgres`) — real RLS, real triggers, pg_trgm.
- **GoTrue v2.171** (`supabase/auth`) — the actual Supabase auth server:
  signup, password login, magic links, PKCE OAuth, refresh rotation.
- **PostgREST v12** — the actual Supabase data API: role switching from the
  JWT `role` claim (anon / authenticated / service_role).
- **Gateway** (bun) — a tiny reverse proxy that gives the stack the same
  single-origin URL shape as hosted Supabase (`/rest/v1`, `/auth/v1`) and
  enforces the `apikey → Bearer` convention.

## Usage

```bash
bun run stack:start    # start everything + wire .env (idempotent)
bun run stack:status   # component + port report
bun run stack:stop     # stop everything (data kept)
bun run stack:reset    # wipe the local database (fresh start)
bun run db:seed        # demo users: alex@example.com / sam@example.com (Password123!)
```

`stack:start` appends a managed block to the project `.env`
(`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` pointing
at the local stack). Next.js dev picks up `.env` changes automatically.

Keys are minted once (HS256 JWTs with `role` claims, exactly like hosted
Supabase keys) and kept stable in `.keys.json` — gitignored — so sessions
survive restarts.

## What is intentionally different from hosted Supabase

- **No SMTP** — signup auto-confirms (session issued immediately); magic
  links "send" silently. The API's `dev_link` (dev mode + service role)
  is clickable through the gateway's `/verify` passthrough.
- **No Google provider** — Google OAuth needs a real client id/secret in the
  provider config. `/api/auth/oauth/start` still returns a well-formed
  authorize URL; completing the flow requires the hosted setup (SETUP.md §2).
- The gateway binds to 127.0.0.1 only — the anon key never needs to leave
  the server either way (the app proxies auth server-side).

## Layout

```
scripts/dev-stack/
  bin/           auth, postgrest, migrations/   (downloaded, gitignored)
  node_modules/  @embedded-postgres, pg         (gitignored)
  pgdata/        the Postgres cluster           (gitignored)
  .keys.json     JWT secret + minted keys       (gitignored)
  scripts/       start-* / apply-schema / gateway / e2e-*
  env.sh         shared configuration
  start.sh…      lifecycle entrypoints
```

`apply-schema.mjs` creates the Supabase roles (`anon`, `authenticated`,
`service_role`, `authenticator`), runs GoTrue's auth-schema migrations, and
applies `supabase/migrations/*.sql` (tracked in a `devstack.migrations`
marker table).

## e2e checks

- `scripts/e2e-invite.ts` — invite → signup → accept → membership, and the
  single-use guarantee.

It is rate-limit aware (the API's auth limiter is live!).
