# Echoes — Setup & Deployment Guide

Echoes is engineered around two core layers:

1. **Next.js 16 Web Application**: Hosts the Paper & Ink frontend and the Hono API gateway at `/api`.
2. **Supabase Layer**: Provides identity authentication (GoTrue), database persistence (PostgreSQL 17), and tenant isolation via Row-Level Security (RLS).

This guide walks through setting up your environment, choosing between a local zero-config stack and hosted cloud Supabase, wiring Google OAuth, and preparing for production deployment.

---

## ⚡ Quick Navigation

- [Choose Your Backend](#-choose-your-backend)
- [Option A: Local Supabase Stack (Zero Credentials)](#option-a-local-supabase-stack-zero-credentials)
- [Option B: Hosted Supabase Cloud](#option-b-hosted-supabase-cloud)
- [Google OAuth Setup (Optional)](#-google-oauth-setup-optional)
- [Environment Variables Reference](#-environment-variables-reference)
- [Verification & Health Diagnostics](#-verification--health-diagnostics)
- [Production Deployment & Security](#-production-deployment--security)

---

## 🧭 Choose Your Backend

| Feature                     | Option A: Local Dev Stack           | Option B: Hosted Supabase       |
| :-------------------------- | :---------------------------------- | :------------------------------ |
| **Setup Time**              | ~10 seconds                         | ~5 minutes                      |
| **Cloud Accounts Required** | None (100% offline)                 | Supabase account                |
| **PostgreSQL Version**      | PostgreSQL 17 (Embedded)            | PostgreSQL 15+ (Hosted)         |
| **Authentication Engine**   | Official GoTrue v2 binary           | Official GoTrue v2 cloud        |
| **Data Engine**             | PostgREST v12 binary                | PostgREST cloud                 |
| **Google OAuth**            | Mocked initiation only              | Full PKCE OAuth round-trip      |
| **Email Verification**      | Instant auto-confirm                | Configurable (SMTP or auto)     |
| **Ideal For**               | Fast local dev, CI, offline testing | Staging & Production deployment |

---

## Option A: Local Supabase Stack (Zero Credentials)

The local dev stack spins up real binaries for Postgres 17, GoTrue, and PostgREST right on your workstation. It requires **no Docker** and **no cloud account**.

### 1. Install & Initialize

```bash
# 1. Install project dependencies
bun install

# 2. Download and prepare dev stack binaries (~25 MB, run once)
(cd scripts/dev-stack && bun install)

# 3. Boot the stack
bun run stack:start
```

`stack:start` is completely idempotent. It:

- Initializes an isolated Postgres cluster in `scripts/dev-stack/pgdata/`.
- Applies the database schema migrations from `supabase/migrations/*.sql`.
- Generates stable local cryptographic keys into `scripts/dev-stack/.keys.json`.
- Appends a managed `SUPABASE_*` configuration block directly to your `.env`.

### 2. Seed & Run

```bash
# Populate demo accounts, groups, and sample entries
bun run db:seed

# Start the Next.js development server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in using:

- **Email**: `alex@example.com`
- **Password**: `Password123!`

> [!TIP]
> **Stack Lifecycle Commands**:
>
> - `bun run stack:status` — Check health and active ports.
> - `bun run stack:stop` — Pause all running services (preserves data).
> - `bun run stack:reset` — Wipe database and re-apply fresh migrations.

---

## Option B: Hosted Supabase Cloud

When preparing for staging or production, connect Echoes to an official Supabase cloud project.

### 1. Create Project

1. Navigate to [supabase.com](https://supabase.com) and create a new project.
2. Note your database password and wait for provisioning to finish.

### 2. Apply Database Migrations

1. Open your Supabase Project Dashboard and go to the **SQL Editor**.
2. Run the SQL files located in `supabase/migrations/` in sequential order:
   - `0001_init.sql` (Creates profiles, notebooks, entries, groups, RLS policies, triggers, and full-text search indexes).

### 3. Configure Authentication Settings

1. Navigate to **Authentication → Providers → Email**:
   - **Confirm email**: Turn **OFF** for immediate local/staging signups, or **ON** for production email verification via SMTP.
2. Navigate to **Authentication → URL Configuration**:
   - **Site URL**: Set to your canonical domain (e.g. `https://echoes.yourdomain.com` or `http://localhost:3000` for dev).
   - **Redirect URLs**: Add:
     - `http://localhost:3000/**`
     - `https://echoes.yourdomain.com/**`
     - `<YOUR_APP_URL>/auth/callback`

### 4. Wire `.env` Credentials

Navigate to **Project Settings → API** in your dashboard, copy the credentials, and update your `.env`:

```env
# Application Base URL (no trailing slash)
APP_URL=http://localhost:3000

# Hosted Supabase Credentials
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsIn...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsIn...
```

> [!IMPORTANT]
> The `SUPABASE_SERVICE_ROLE_KEY` is strictly server-side (used for database seeding and admin verification). It is never sent to or bundled into the client application.

---

## 🔐 Google OAuth Setup (Optional)

Echoes implements a **PKCE OAuth flow routed entirely through the Hono API**, ensuring your anon key remains shielded from the client browser.

### 1. Google Cloud Console

1. Visit [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials).
2. Create a new **OAuth 2.0 Client ID** with type **Web Application**.
3. Set **Authorized JavaScript origins**:
   - `http://localhost:3000` (for local development)
   - `https://echoes.yourdomain.com` (for production)
4. Set **Authorized redirect URIs**:
   - `https://<your-project-ref>.supabase.co/auth/v1/callback`
     _(This points to Supabase Auth, which securely redirects back to your application)_
5. Save and copy the **Client ID** and **Client Secret**.

### 2. Supabase Dashboard

1. Go to **Authentication → Providers → Google**.
2. Toggle Google **ON**, paste your **Client ID** and **Client Secret**, and save.
3. Ensure `<APP_URL>/auth/callback` is included in **Authentication → URL Configuration → Redirect URLs**.

---

## ⚙️ Environment Variables Reference

| Variable                    | Required | Description                                                                                      | Example                          |
| :-------------------------- | :------: | :----------------------------------------------------------------------------------------------- | :------------------------------- |
| `APP_URL`                   |   Yes    | Canonical origin of your frontend application. Used for building OAuth and invite redirect URLs. | `http://localhost:3000`          |
| `SUPABASE_URL`              |   Yes    | Endpoint of the Supabase API (local gateway or cloud).                                           | `https://xyz.supabase.co`        |
| `SUPABASE_ANON_KEY`         |   Yes    | Public key for client/gateway communication.                                                     | `eyJhbGci...`                    |
| `SUPABASE_SERVICE_ROLE_KEY` | Dev/Seed | Elevated key for database seeding and maintenance scripts. Kept strictly server-side.            | `eyJhbGci...`                    |
| `AI_API_KEY`                | Optional | API key for OpenAI, Anthropic, or any compatible provider (Groq, Together, DeepSeek, etc.).      | `sk-...`                         |
| `AI_ENTRYPOINT`             | Optional | Base URL or endpoint for the AI provider (default `https://api.openai.com/v1`).                  | `https://api.groq.com/openai/v1` |
| `AI_MODEL`                  | Optional | Model identifier to use for the AI companion (default `gpt-4o-mini`).                            | `gpt-4o-mini`                    |
| `PORT`                      | Optional | Port for the Next.js application server (default `3000`).                                        | `3000`                           |
| `NODE_ENV`                  | Optional | Environment mode (`development` or `production`).                                                | `production`                     |

---

## 🧪 Verification & Health Diagnostics

Once configured, verify your setup with the built-in diagnostic tools:

### 1. Automated OpenAPI Contract Smoke Test

```bash
bun run db:smoke
```

Validates that the Hono API routes, Zod schemas, and OpenAPI specification correctly match expectations.

### 2. Automated Membership & Invite E2E Test

```bash
bun run stack:e2e
```

Executes automated invite creation, join validation, owner approval, and revocation against the running stack.

### 3. In-Browser Developer Diagnostics

Start the server with `bun run dev` and navigate to:

- **Interactive Developer Console**: [http://localhost:3000/console](http://localhost:3000/console)
  _(Live backend health checks, route pingers, and auth testing)_
- **Scalar OpenAPI Documentation**: [http://localhost:3000/api/docs](http://localhost:3000/api/docs)
  _(Full interactive catalog of all 35 endpoints)_

> [!NOTE]
> `/console` and `/api/docs` are automatically disabled in production environments (`NODE_ENV=production` returns 404).

---

## 🚀 Production Deployment & Security

### Build Without Secrets

Echoes is designed so that `bun run build` requires **zero environment secrets**. If `.env` is unconfigured, the application boots gracefully and serves calm 503 notices until keys are supplied. This makes preview deployments (e.g. Vercel, Railway, Docker) deterministic and safe.

### Production Security Checklist

- [x] **PostgreSQL Row-Level Security**: Every single table is RLS-enabled; queries cannot bypass tenancy bounds even if an endpoint has an error.
- [x] **Sliding-Window Rate Limiting**: Auth endpoints enforce rate limits (12 requests / 5 minutes per IP; magic links 4 requests / 10 minutes).
- [x] **Hardened HTTP Headers**: Strict Content-Security-Policy, frame-options (`DENY`), X-Content-Type-Options (`nosniff`), Referrer-Policy, and HSTS headers configured in `next.config.ts`.
- [x] **Shielded Keys**: OAuth tokens and anon keys are kept out of client-side code through server proxy routes (`/api/auth/oauth/*`).
- [x] **Safe Sessions**: Bearer JWT tokens with transparent server-side refresh token rotation via `/api/auth/refresh`.
