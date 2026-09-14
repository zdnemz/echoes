# Echoes Dev Stack — Local Supabase Runtime

A lightweight, self-contained, Supabase-compatible backend that runs entirely on your local workstation without Docker or cloud credentials. Full application capabilities (authentication, database triggers, RLS isolation, and data APIs) work seamlessly offline.

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
                 │      (Unified Reverse Proxy)          │
                 └──────────┬─────────────────┬──────────┘
                            │                 │
              /rest/v1      ▼                 ▼  /auth/v1
                 ┌────────────────────┐    ┌────────────────────┐
                 │  PostgREST :5998   │    │   GoTrue :5999     │
                 │ (REST API with RLS)│    │ (Auth, JWT, PKCE)  │
                 └──────────┬─────────┘    └──────────┬─────────┘
                            │                         │
                            ▼                         ▼
                 ┌──────────────────────────────────────────────┐
                 │            PostgreSQL 17 :5432               │
                 │  • @embedded-postgres engine                 │
                 │  • RLS policies, triggers & pg_trgm          │
                 └──────────────────────────────────────────────┘
```

### Component Breakdown

- **PostgreSQL 17** (`@embedded-postgres`): Official embedded PostgreSQL engine with real RLS policy evaluation, database triggers, and `pg_trgm` extension support.
- **GoTrue v2.171** (`supabase/auth`): The official Supabase authentication daemon handling signup, password verification, magic links, PKCE OAuth redirects, and refresh token rotation.
- **PostgREST v12**: The official Supabase data engine executing direct SQL with role-switching based on the JWT `role` claim (`anon`, `authenticated`, `service_role`).
- **Gateway**: A lean Bun reverse proxy routing `/rest/v1` and `/auth/v1` through a single origin (`http://127.0.0.1:54321`) matching Supabase cloud conventions.

---

## ⚡ Command Reference

All stack commands can be executed directly from the project root:

| Command                | Action                        | Notes                                                              |
| :--------------------- | :---------------------------- | :----------------------------------------------------------------- |
| `bun run stack:start`  | Boot all stack services       | Idempotent. Auto-configures managed `.env` block.                  |
| `bun run stack:status` | Health & port report          | Displays PID, listening ports, and status of all daemons.          |
| `bun run stack:stop`   | Gracefully shut down services | Halts background processes while keeping database data intact.     |
| `bun run stack:reset`  | Clean slate reset             | Wipes `pgdata/` storage directory and re-runs initial migrations.  |
| `bun run stack:e2e`    | Run invite flow test          | Tests link generation, auto-accept, review, and revocation.        |
| `bun run db:seed`      | Populate demo fixtures        | Seeds default test users (`alex@example.com` / `sam@example.com`). |

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
- **Loopback Binding**: Services bind strictly to `127.0.0.1`, guaranteeing zero unintended network exposure.

---

## 📁 Directory Structure

```text
scripts/dev-stack/
├── bin/           # GoTrue, PostgREST binaries, and auth schema migrations (gitignored)
├── pgdata/        # Local PostgreSQL 17 data cluster (gitignored)
├── .keys.json     # Stable JWT signing secret and minted tokens (gitignored)
├── scripts/       # Startup scripts, schema applicator, gateway, and e2e checks
├── env.sh         # Shared environment definitions and port allocations
└── start.sh       # Main lifecycle entrypoint for bun run stack:start
```
