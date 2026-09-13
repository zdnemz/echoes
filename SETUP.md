# Setup guide

Echoes runs on two pieces: the Next.js app (which also hosts the Hono API at `/api`) and a Supabase project for auth + data. This guide takes an empty checkout to a fully-wired deployment.

There are two ways to get a Supabase: **run one locally with zero credentials** (§0) or **use the hosted one** (§1). Everything else in the app is identical between the two.

## 0. Local Supabase, zero credentials (dev stack)

Before any cloud account exists, the full product — signup, login, RLS — runs against a self-hosted, Supabase-compatible stack (real Postgres 17 + the actual GoTrue and PostgREST binaries, fronted by a small gateway):

```bash
bun install
cd scripts/dev-stack && bun install && cd ../..
bun run stack:start      # postgres + gotrue + postgrest + gateway, wires .env
bun run dev              # app on :3000
bun run db:seed          # demo users: alex@example.com / sam@example.com (Password123!)
```

`stack:start` is idempotent and appends a managed `SUPABASE_*` block to `.env` pointing at `http://127.0.0.1:54321`. First start downloads the binaries (~25 MB) and applies all SQL migrations. Details, e2e checks and the architecture diagram: `scripts/dev-stack/README.md`.

Local differences from hosted: no SMTP (signup auto-confirms; magic links "send" silently — use the `dev_link` from the API response in dev mode), and no Google provider (that needs real Google credentials, §2). When you're ready to switch to hosted Supabase, replace the managed `.env` block with §1 values — zero code changes.

## 1. Supabase (auth + database + RLS)

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine to start).
2. Apply the schema: open the **SQL editor** in the dashboard, paste the contents of the files in `supabase/migrations/` in filename order (`0001_init.sql` first). They create the tables, row-level-security policies, and the `profiles` trigger.
3. Copy `Project Settings → API` values into `.env`:
   ```bash
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_ANON_KEY=<anon key>
   SUPABASE_SERVICE_ROLE_KEY=<service role key>
   ```
   The service role key is only read server-side (seed script, magic-link dev mode) and never reaches the browser bundle.
4. **Recommended**: `Authentication → Providers → Email` — decide whether "Confirm email" is on. With confirmation ON, signups return a null session until the email is confirmed; with it OFF, signup logs straight in (fine for local dev).
5. `Authentication → URL Configuration`: add your production origin (`https://your-domain`) to **Site URL** and **Redirect URLs**, plus `http://localhost:3000/**` for development.

## 2. Google OAuth (one-click sign-in)

The app uses Supabase's Google provider with a **PKCE flow routed through our own API**, so the anon key never appears in the browser. There are no Google env vars in the app; the credentials live in Supabase's dashboard.

1. **Google Cloud Console** → _APIs & Services → Credentials → Create credentials → OAuth client ID_.
   - Application type: **Web application**
   - Authorized JavaScript origins: `https://your-domain` (and `http://localhost:3000` for dev)
   - Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
     _(this is Supabase's callback — Google hands the user back to Supabase, which then redirects to the app)_
2. Copy the generated **client ID** and **client secret**.
3. **Supabase Dashboard** → _Authentication → Providers → Google_ → enable it, paste the client ID/secret.
4. **Supabase Dashboard** → _Authentication → URL Configuration_ → add `<APP_URL>/auth/callback` to the allowed **Redirect URLs** (e.g. `http://localhost:3000/auth/callback` and `https://your-domain/auth/callback`).
5. Set `APP_URL` in `.env` to match (no trailing slash) — the API builds the OAuth redirect from it, server-side.

**Flow when it's wired:** the sign-in panel's "Continue with Google" button generates a PKCE verifier in the browser, asks `/api/auth/oauth/start` for the authorize URL (built from `APP_URL`), Supabase runs the Google consent round-trip and lands on `/auth/callback?code=…`, and that page exchanges the code via `/api/auth/oauth/callback`. Profile creation happens through the same database trigger as email signup; the Google profile name is backfilled as the display name.

## 3. Run it

```bash
bun install
cp .env.example .env      # fill in the Supabase values (or run the local stack, §0)
bun run dev               # app + API on :3000

# production
bun run build && bun run start
```

Optional: seed demo data (2 users, a family group, shared notebook, entries):

```bash
bun run db:seed
```

## 4. Deployment notes

- **Build requires no secrets** — the app boots without Supabase keys and serves a calm "backend not wired" state (503 envelopes) until `.env` is filled. That makes CI/CD and preview builds trivial.
- **Security posture** (see `src/` for the enforcement):
  - Postgres RLS on every table; user identity always derived from the verified JWT, never from request bodies.
  - Sliding-window rate limits on all auth endpoints (12 / 5 min per IP; magic link 4 / 10 min).
  - Dev surfaces — `/console`, `/api/doc`, `/api/docs` — are **dev-only**: production returns 404.
  - Security headers (frame-deny, nosniff, referrer policy, permissions policy, HSTS) set in `next.config.ts`.
  - OAuth + token refresh proxied server-side (`/api/auth/oauth/*`, `/api/auth/refresh`) — the anon key stays on the server.
- **Sessions** are Supabase JWTs kept in `localStorage` and sent as bearer tokens (the same model `@supabase/supabase-js` uses by default). Refresh tokens rotate transparently via `/api/auth/refresh` when an access token expires. If your threat model calls for httpOnly cookies instead, the API surface (`/api/auth/*`) is the only place to change.
- **Git hooks** (husky): pre-commit runs eslint + prettier on staged files; pre-push runs typecheck + lint + format check + a full production build. Nothing broken gets pushed.
