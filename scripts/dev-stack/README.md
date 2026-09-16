# Echoes Dev Stack — Local Supabase Runtime (Docker)

A lightweight, self-contained, Supabase-compatible backend that runs entirely on your local workstation in Docker containers — no cloud credentials. Full application capabilities (authentication, database triggers, RLS isolation, and data APIs) work seamlessly offline.

Same services, versions, ports and behavior as the previous binary stack — only the process supervisor changed from `setsid` to `docker compose`.

---

## 🏛️ Architecture & Port Map

```
                 ┌───────────────────────────────────────┐
                 │           Next.js App :3000           │
                 └──────────────────┬────────────────────┘
                                    │ SUPABASE_URL
                                    ▼
                 ┌───────────────────────────────────────┐
                 │         Local Gateway :54321          │
                 │      (Unified Reverse Proxy, bun)     │
                 └──────────┬─────────────────┬──────────┘
                            │                 │
              /rest/v1      ▼                 ▼  /auth/v1
                 ┌────────────────────┐    ┌────────────────────┐
                 │  PostgREST :5998   │    │   GoTrue :5999     │
                 │ (REST API with RLS)│    │ (Auth, JWT, PKCE)  │
                 │  container (host    │    │  container (host   │
                 │  port mapping)      │    │  port mapping)     │
                 └──────────┬─────────┘    └──────────┬─────────┘
                            │                         │
                            ▼                         ▼
                 ┌──────────────────────────────────────────────┐
                 │            PostgreSQL 17 (container)         │
                 │  • RLS policies, triggers & pg_trgm          │
                 │  • Data in the pgdata docker volume          │
                 └──────────────────────────────────────────────┘
```

### Component Breakdown

- **PostgreSQL 17** (`postgres:17`): Official image with real RLS policy evaluation, database triggers, and `pg_trgm` extension support.
- **GoTrue v2.171** (`supabase/auth:v2.171.0`): The official Supabase authentication daemon handling signup, password verification, magic links, PKCE OAuth redirects, and refresh token rotation.
- **PostgREST v12** (`postgrest/postgrest:v12.2.12`): The official Supabase data engine executing direct SQL with role-switching based on the JWT `role` claim (`anon`, `authenticated`, `service_role`).
- **Gateway**: A lean Bun reverse proxy (on the host) routing `/rest/v1` and `/auth/v1` through a single origin (`http://127.0.0.1:54321`) matching Supabase cloud conventions.

Auth schema migrations run via `docker compose run --rm auth auth migrate` (the image carries the same binary as the old `bin/auth`); app migrations in `supabase/migrations/` apply through `scripts/apply-schema.mjs` exactly as before.

---

## ⚡ Command Reference

All stack commands can be executed directly from the project root:

| Command                | Action                        | Notes                                                               |
| :--------------------- | :---------------------------- | :------------------------------------------------------------------ |
| `bun run stack:start`  | Boot all stack services       | Idempotent. Auto-configures managed `.env` block.                   |
| `bun run stack:status` | Health & port report          | Container states plus real HTTP probes per service.                 |
| `bun run stack:stop`   | Gracefully shut down services | `docker compose down`; database data intact (volume kept).          |
| `bun run stack:reset`  | Clean slate reset             | Removes the pgdata volume and re-runs all migrations on next start. |
| `bun run stack:e2e`    | Run invite flow test          | Tests link generation, auto-accept, review, and revocation.         |
| `bun run db:seed`      | Populate demo fixtures        | Seeds default test users (`alex@example.com` / `sam@example.com`).  |

---

## 🔒 Configuration & Key Persistence

When `stack:start` is run for the first time:

1. It generates stable cryptographic keys (HS256 JWTs for `anon` and `service_role`) and stores them in `scripts/dev-stack/.keys.json` (gitignored).
2. It appends a managed configuration section to your root `.env`:
   ```env
   # --- BEGIN ECHOES DEV-STACK (managed) ---
   SUPABASE_URL=http://127.0.0.1:54321
   SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   # --- END ECHOES DEV-STACK ---
   ```
3. Because keys are kept in `.keys.json`, your test sessions and JWT tokens survive service restarts.

---

## 🔍 Local vs. Cloud Supabase Differences

- **Instant Auto-Confirm**: No SMTP server required. Signups auto-confirm immediately, and magic links generate a clickable `dev_link` in API debug responses.
- **Mocked OAuth Initiation**: Real Google sign-in requires Google Cloud Console credentials. For Google OAuth testing, switch to hosted Supabase as outlined in [SETUP.md](../../SETUP.md).
- **Loopback Binding**: Host port mappings bind to all interfaces by default; every service is still only reachable from this machine in practice (no published LAN address unless Docker is told otherwise).

---

## 📁 Directory Structure

```text
scripts/dev-stack/
├── bin/migrations/  # GoTrue auth-schema SQL, mounted into the auth container (gitignored)
├── docker-compose.yml # db + auth + rest services (pins image versions)
├── .keys.json     # Stable JWT signing secret and minted tokens (gitignored)
├── scripts/       # Schema applicator, gateway, and e2e checks
├── env.sh         # Shared environment definitions and port allocations
└── start.sh       # Main lifecycle entrypoint for bun run stack:start
```
