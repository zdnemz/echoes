<div align="center">

# Echoes

**A quiet place for loud thoughts.**

A contemplative personal journal crafted with a tactile _Paper & Ink_ aesthetic. Markdown entries with mood tracking and tag taxonomies, private notebooks you keep strictly to yourself — and the one notebook you choose to share live with the people who matter.

[![Next.js 16](https://img.shields.io/badge/Next.js-16.3-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![Hono](https://img.shields.io/badge/Hono-v4-E36002?style=for-the-badge&logo=hono&logoColor=white)](https://hono.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-RLS%20Enforced-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![PostgreSQL 17](https://img.shields.io/badge/PostgreSQL-17-336791?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS 4](https://img.shields.io/badge/Tailwind-CSS%204-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Bun](https://img.shields.io/badge/Bun-Runtime-fbf0df?style=for-the-badge&logo=bun&logoColor=black)](https://bun.sh/)

[Key Features](#-key-features) • [Architecture](#-architecture) • [Quick Start](#-quick-start) • [Interactive Surfaces](#-interactive-surfaces) • [Project Layout](#-project-layout) • [Scripts](#-scripts) • [Setup Guide](./SETUP.md)

</div>

---

## ✨ Key Features

- **🖋️ Paper & Ink Aesthetic**
  - Warm cream canvas, Newsreader editorial serif typography, custom hand-drawn mood glyphs (_Sun, Sunrise, Level, Drizzle, Squall_), and distraction-free split-pane Markdown workspace.
  - Zero generic UI templates — custom design tokens calibrated for thoughtful writing.

- **🔒 Selective Sharing & Strict RLS**
  - Private notebooks by default. Selectively link one notebook to a trusted group.
  - PostgreSQL Row-Level Security (RLS) acts as the source of truth — user identity is verified server-side from signed JWTs, never trusted from client payloads.

- **⚡ Zero-Credential Local Dev Stack**
  - Self-contained local Supabase runtime: real PostgreSQL 17, GoTrue v2 auth server, and PostgREST v12 unified behind a local gateway.
  - Test signups, logins, triggers, and full RLS policies offline without creating cloud accounts or managing API keys.

- **🚀 Typed Hono API & OpenAPI 3.1**
  - 35 endpoints built with Hono and `@hono/zod-openapi` mounted natively inside Next.js.
  - Interactive Scalar API reference at `/api/docs` and development console at `/console`.
  - Rate limiting with sliding windows and standard RFC-compliant error envelopes.

- **🤝 Live Collaboration & Invites**
  - Real-time notebook presence, broadcast updates, and secure group invite links with instant-join or owner-approval flows.

---

## 🏛️ Architecture

```
                    ┌────────────────────────────────────────────────────────┐
                    │                      Browser / Client                  │
                    │      Next.js 16 App Router (Paper & Ink Design System) │
                    └───────────────────────────┬────────────────────────────┘
                                                │
                          HTTP / REST           │  WebSockets (Presence & Updates)
                        (Bearer Token)          │
                                                ▼
                    ┌────────────────────────────────────────────────────────┐
                    │               API Layer: Hono on Next.js               │
                    │  • OpenAPI 3.1 + Zod Schema Validation                 │
                    │  • Auth Proxy & Sliding-Window Rate Limiting           │
                    │  • Per-Request Authenticated Client Binding            │
                    └───────────────────────────┬────────────────────────────┘
                                                │
                                                ▼
                    ┌────────────────────────────────────────────────────────┐
                    │             Supabase / Local Dev Stack Gateway         │
                    ├───────────────────────────┬────────────────────────────┤
                    │   GoTrue Auth Engine      │   PostgREST Data Engine    │
                    │   • JWT & PKCE OAuth      │   • Direct SQL with RLS    │
                    │   • Refresh Token Rot.    │   • Role Switching         │
                    └─────────────┬─────────────┴──────────────┬─────────────┘
                                  │                            │
                                  ▼                            ▼
                    ┌────────────────────────────────────────────────────────┐
                    │                 PostgreSQL 17 Database                 │
                    │   • Strict Row-Level Security Policies                 │
                    │   • Triggers, Trigram Search (pg_trgm), GIN Indexes    │
                    └────────────────────────────────────────────────────────┘
```

### Security & Data Isolation

- **Auth**: Supabase JWTs used as bearer tokens. OAuth and token refresh are proxied server-side (`/api/auth/oauth/*`, `/api/auth/refresh`), preventing client exposure of sensitive keys.
- **Data Guardrails**: Every query resolves through a client scoped to the user's JWT. RLS policies in `supabase/migrations/` enforce tenant boundaries directly at the database engine level.

---

## ⚡ Quick Start

### 1. Prerequisites

- [Bun](https://bun.sh/) (v1.1+) installed locally.
- _No cloud accounts or external databases required to start._

### 2. One-Command Setup

Clone the repository and run the local zero-dependency stack:

```bash
# 1. Install root dependencies
bun install

# 2. Install local dev stack binaries (Postgres 17, GoTrue, PostgREST — ~25 MB, once)
(cd scripts/dev-stack && bun install)

# 3. Start local Supabase backend (automatically configures .env)
bun run stack:start

# 4. Seed demo users, notebooks, and entries
bun run db:seed

# 5. Launch the application
bun run dev
```

Visit **[http://localhost:3000](http://localhost:3000)** to open Echoes.

### 3. Demo Credentials

The seed script (`bun run db:seed`) provides ready-to-use accounts:

| User     | Email              | Password       | Role / Data                                          |
| :------- | :----------------- | :------------- | :--------------------------------------------------- |
| **Alex** | `alex@example.com` | `Password123!` | Group owner; contains private & shared notebooks     |
| **Sam**  | `sam@example.com`  | `Password123!` | Member of Alex's "Family" group; shared collaborator |

> [!TIP]
> Ready to switch from the local stack to hosted Supabase cloud or configure Google OAuth? Check out the full **[SETUP.md](./SETUP.md)** guide.

---

## 🧭 Interactive Surfaces

| Surface               | Path                                                         | Description & Notes                                                               |
| :-------------------- | :----------------------------------------------------------- | :-------------------------------------------------------------------------------- |
| **Marketing Site**    | `/`, `/features`, `/pricing`, `/about`, `/privacy`, `/terms` | Server-rendered editorial storytelling with Paper & Ink design tokens.            |
| **Journal Workspace** | `/journal`                                                   | Split-pane markdown editor, mood pickers, tags, search, and group notebook feeds. |
| **Google OAuth**      | `/auth/callback`                                             | Server-proxied PKCE OAuth round-trip; anon key never leaks to client.             |
| **Group Invites**     | `/invites/accept?token=…`                                    | Secure tokenized link flow for instant join or owner review.                      |
| **API Engine**        | `/api/*`                                                     | 35 OpenAPI-documented endpoints with Zod validation and RLS scoping.              |
| **API Documentation** | `/api/docs`                                                  | Interactive **Scalar** OpenAPI UI. _(Development only; 404 in production)_        |
| **Developer Console** | `/console`                                                   | Live backend health, route inspector, and auth sandbox. _(Development only)_      |

---

## 📁 Project Layout

```text
├── src/
│   ├── app/                 # Next.js App Router (pages, layouts, route handlers)
│   │   ├── (marketing)/     # Landing, story pages, pricing, legal
│   │   ├── journal/         # Core journal split-pane workspace
│   │   ├── console/         # Developer diagnostics and API inspector
│   │   ├── invites/         # Invite acceptance and verification flows
│   │   └── api/             # Hono entrypoint mounted at /api/[[...route]]
│   ├── server/              # Hono backend application
│   │   ├── routes/          # Typed route modules (auth, notebooks, entries, groups)
│   │   ├── schemas/         # Shared Zod schemas and OpenAPI specifications
│   │   └── middleware/      # Rate-limiting, auth verification, and error handlers
│   ├── components/          # UI component library & Paper & Ink design system
│   │   ├── ui/              # Radix UI primitives & custom styled controls
│   │   ├── journal/         # Editor pane, viewer, tag selector, mood glyphs
│   │   └── landing/         # Editorial interactive landing sections
│   └── lib/                 # Shared utilities, API client, session external store
├── supabase/
│   └── migrations/          # SQL migrations, RLS policies, indexes, and triggers
└── scripts/
    ├── dev-stack/           # Embedded local Supabase-compatible runtime
    ├── seed.ts              # Database seeding script for local/hosted environments
    └── smoke-openapi.ts     # OpenAPI schema contract test suite
```

---

## 🛠️ Scripts

| Command                | Description                                                  |
| :--------------------- | :----------------------------------------------------------- |
| `bun run dev`          | Starts Next.js development server on `http://localhost:3000` |
| `bun run build`        | Compiles production-ready standalone Next.js build           |
| `bun run start`        | Launches production standalone server                        |
| `bun run lint`         | Runs ESLint across the codebase                              |
| `bun run typecheck`    | Type-checks code with `tsc --noEmit`                         |
| `bun run format`       | Formats all code with Prettier                               |
| `bun run format:check` | Verifies code formatting adherence                           |
| `bun run db:seed`      | Seeds demo accounts and notebook entries                     |
| `bun run db:smoke`     | Executes OpenAPI contract verification tests                 |
| `bun run stack:start`  | Boots local Supabase stack (Postgres + GoTrue + PostgREST)   |
| `bun run stack:status` | Inspects status and port bindings of local services          |
| `bun run stack:stop`   | Gracefully stops the local dev stack                         |
| `bun run stack:reset`  | Resets local database storage and re-applies migrations      |
| `bun run stack:e2e`    | Runs end-to-end invite and membership lifecycle tests        |

> [!NOTE]
> **Git Hooks (Husky)**:
>
> - `pre-commit`: Automatically formats and lints staged files.
> - `pre-push`: Validates types, formatting, linting, and runs a full production build before push.

---

## 📄 License

Built by Stillwater Studio. Licensed under the [MIT License](LICENSE).
