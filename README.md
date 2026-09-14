<div align="center">

# Echoes

### A quiet place for loud thoughts.

A contemplative personal journaling sanctuary built with a tactile **Paper & Ink** editorial aesthetic. Write Markdown entries with mood tracking and tag taxonomies, keep your notebooks strictly private by default, selectively open live sharing circles with the people who matter most, and converse with a permission-grounded AI companion.

[![Next.js 16](https://img.shields.io/badge/Next.js-16.3-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![Hono](https://img.shields.io/badge/Hono-v4-E36002?style=for-the-badge&logo=hono&logoColor=white)](https://hono.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-RLS%20Enforced-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![PostgreSQL 17](https://img.shields.io/badge/PostgreSQL-17-336791?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS 4](https://img.shields.io/badge/Tailwind-CSS%204-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Bun](https://img.shields.io/badge/Bun-Runtime-fbf0df?style=for-the-badge&logo=bun&logoColor=black)](https://bun.sh/)

[Why Echoes?](#-why-echoes) • [Core Experience](#-core-experience) • [Realtime & Circles](#-realtime-sharing-circles) • [Reflect AI](#-reflect--grounded-ai-companion) • [Quick Start](#-quick-start) • [Setup Guide](./SETUP.md)

</div>

---

## 🍃 Why Echoes?

Most modern notes apps try to be your second brain: endless kanban boards, complex backlink graphs, team workspaces, and productivity dashboards. Social apps demand your attention with streak guilt, gamification loops, and algorithmic feeds.

**Echoes is the digital equivalent of a linen-bound notebook** — something that holds the day, asks for nothing in return, and keeps its mouth shut.

- **No Streak Guilt**: No artificial red dots or guilt-tripping push notifications engineered to manipulate your dopamine.
- **Privacy by Engine, Not by Policy**: Every notebook starts private and stays that way. Your privacy is enforced by PostgreSQL Row-Level Security directly at the database engine level — not by a terms of service promise.
- **Selective Connection**: When you want to share, you don't broadcast to a public feed. You link one specific notebook to a small circle of trusted friends or family.

---

## 🖋️ Core Experience

### 📜 Paper & Ink Editorial Aesthetic

- **Tactile Palette**: Warm paper canvas, deep ink contrasts, and subtle earthen clay tones designed for long, comfortable writing sessions.
- **Newsreader Serif Typography**: Generous line heights, thoughtful measures, and distraction-free split-pane Markdown composition.
- **Hand-Crafted Mood Glyphs**: Rate your day through evocative, original weather glyphs: _Sun_ (Great), _Sunrise_ (Good), _Level_ (Okay), _Drizzle_ (Low), and _Squall_ (Rough).
- **Taxonomies & Deep Search**: Organise thoughts with tag systems and full-text trigram indexing (`pg_trgm`) that searches across years of entries in milliseconds.

---

## ⭕ Realtime Sharing Circles

A sharing circle is a private room for a handful of people you trust with a notebook.

- **Live Chatroom Experience**: Seamlessly view shared notebook entries as a living chronological conversation.
- **Zero-Refresh Live Sync**: Real-time Server-Sent Events (SSE) stream pushes new messages, member join/leave events, and pending requests instantly without page reloads.
- **WhatsApp-Style Read Receipts**: Know when circle members have seen your entries with blue double checkmarks (`Checks`) and instant reader indicators.
- **Live Typing & Ephemeral Presence**: Gentle, non-intrusive typing indicators keep conversations natural and alive.
- **Instant Links & Approval Queues**: Invite trusted members with expiring capability links, toggling between instant-join or owner-approval modes.
- **Discord & Slack Webhooks**: Configure a webhook URL per circle to receive peace-of-mind alerts in Discord or Slack whenever someone requests access, joins, or leaves.

---

## 🧠 Reflect — Grounded AI Companion

A warm, thoughtful conversational companion — _not a guru, not a therapist_.

- **Permission-Scoped by Design**: Tick only the specific notebooks Reflect is permitted to consult. Anything outside your selection remains strictly invisible.
- **Grounded in Reality**: An autonomous tool loop searches your actual entries, inspects mood trends, and quotes real words instead of inventing platitudes.
- **Any Provider (OpenAI & Anthropic Compatible)**: Completely open and decoupled from vendor lock-in. Connect your own API key and entrypoint:
  - **OpenAI Compatible**: Groq, Together AI, DeepSeek, Cerebras, Ollama, vLLM, or OpenAI.
  - **Anthropic Compatible**: Claude 3.5 Haiku, Claude 3.5 Sonnet.
- **Zero Memory Leaks**: Entirely stateless per request; your private thoughts are never retained for model training.

---

## ⚡ Quick Start

Experience Echoes locally in under two minutes with our self-contained, zero-cloud development stack.

### 1. Prerequisites

- [Bun](https://bun.sh/) (v1.1+) installed locally.
- _No cloud accounts or external databases required._

### 2. One-Command Setup

```bash
# 1. Clone repository & install dependencies
git clone https://github.com/zdnemz/echoes.git
cd echoes
bun install

# 2. Install dev-stack binaries (Postgres 17, GoTrue, PostgREST — ~25 MB, run once)
(cd scripts/dev-stack && bun install)

# 3. Start local Supabase backend & seed demo data
bun run stack:start
bun run db:seed

# 4. Start the application
bun run dev
```

Visit **[http://localhost:3000](http://localhost:3000)** to begin writing.

### 3. Demo Accounts

| User     | Email              | Password       | Access                                         |
| :------- | :----------------- | :------------- | :--------------------------------------------- |
| **Alex** | `alex@example.com` | `Password123!` | Group owner with private and shared notebooks  |
| **Sam**  | `sam@example.com`  | `Password123!` | Collaborator in Alex's "Family" sharing circle |

---

## 🧭 Interactive Surfaces

| Surface               | Route                     | Purpose                                                                        |
| :-------------------- | :------------------------ | :----------------------------------------------------------------------------- |
| **Editorial Landing** | `/`                       | Storytelling, feature breakdown, and pricing philosophy.                       |
| **Journal Workspace** | `/journal`                | Split-pane markdown writing, mood glyph selector, and circle chats.            |
| **Reflect Companion** | `/journal` (Reflect tab)  | Tool-augmented conversational reflection over chosen notebooks.                |
| **Sharing Circles**   | `/journal` (Groups tab)   | Live chat, member roster, invite links, and webhook management.                |
| **Invite Acceptance** | `/invites/accept?token=…` | Tokenized instant-join or request-approval landing page.                       |
| **API Reference**     | `/api/docs`               | Interactive **Scalar** OpenAPI 3.1 documentation _(Development)_.              |
| **System Console**    | `/console`                | Live backend diagnostics, route inspector, and health metrics _(Development)_. |

---

## 🏗️ Architecture & Engineering Principles

```
┌────────────────────────────────────────────────────────┐
│                   Browser / Client                     │
│   Next.js 16 App Router (Paper & Ink Design System)    │
│   React 19 • Tailwind CSS 4 • TanStack Query v5        │
└───────────────────────────┬────────────────────────────┘
                            │
      HTTP / REST (Bearer)  │  SSE Stream (Realtime Presence & Events)
                            ▼
┌────────────────────────────────────────────────────────┐
│              API Engine: Hono on Next.js               │
│   • OpenAPI 3.1 Contract + Zod Schema Validation       │
│   • Server-Side Auth Proxy & Rate Limiting Buckets     │
│   • Outbound Webhook Dispatcher (Discord / Slack)      │
│   • Tool-Calling Agent Loop (OpenAI & Anthropic)       │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│           Supabase / Embedded Dev Stack Gateway        │
│   • GoTrue Auth (PKCE OAuth & JWT Rotation)            │
│   • PostgREST Data Engine (Direct SQL with RLS)        │
└─────────────┬────────────────────────────┬─────────────┘
              │                            │
              ▼                            ▼
┌────────────────────────────────────────────────────────┐
│                 PostgreSQL 17 Database                 │
│   • Strict Row-Level Security (RLS) Isolation          │
│   • Trigram Search (pg_trgm) & Automated Triggers      │
└────────────────────────────────────────────────────────┘
```

- **Strict RLS Enforcement**: The database is the true security boundary. Even if the UI is compromised, PostgreSQL refuses to disclose records across tenant boundaries.
- **Zero Client Key Leakage**: Service roles, OAuth secrets, and AI provider API keys remain strictly confined to the server environment.
- **Offline-First Developer Experience**: Embedded dev-stack spins up real PostgreSQL, GoTrue, and PostgREST in seconds for fully isolated testing.

---

## 🛠️ Developer Scripts

| Command                | Action                                                           |
| :--------------------- | :--------------------------------------------------------------- |
| `bun run dev`          | Launch Next.js local development server                          |
| `bun run build`        | Compile standalone production Next.js artifact                   |
| `bun run lint`         | Run ESLint across code and components                            |
| `bun run typecheck`    | Validate TypeScript contracts with `tsc --noEmit`                |
| `bun run format`       | Enforce code formatting with Prettier                            |
| `bun test`             | Run fast unit test suites (API, agent, webhooks)                 |
| `bun run stack:start`  | Boot embedded local dev stack (Postgres 17 + GoTrue + PostgREST) |
| `bun run stack:status` | Check local stack health and port listeners                      |
| `bun run stack:stop`   | Shut down local stack processes                                  |
| `bun run db:seed`      | Seed demo accounts, notebooks, and journal entries               |
| `bun run db:smoke`     | Run OpenAPI 3.1 schema and route contract smoke tests            |

---

## 📄 License

Crafted by Stillwater Studio. Licensed under the [MIT License](LICENSE).
