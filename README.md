# Echoes

_A quiet place for loud thoughts._ A private journal: markdown entries with moods and tags, notebooks you keep to yourself — and the one notebook you choose to share, live, with the people who matter. Built by Stillwater Studio.

![stack](https://img.shields.io/badge/Next.js-16-black) ![stack](https://img.shields.io/badge/Hono-4-e3602b) ![stack](https://img.shields.io/badge/Supabase-RLS-3ecf8e)

## What's inside

| Surface            | Where                                                        | Notes                                                                     |
| ------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Marketing site     | `/`, `/features`, `/pricing`, `/about`, `/privacy`, `/terms` | Multipage, server-rendered, Paper & Ink design system                     |
| The journal        | `/journal`                                                   | Split-pane markdown editor, moods, tags, search, groups, shared notebooks |
| Google OAuth       | `/auth/callback`                                             | PKCE flow, proxied through the API (anon key never client-side)           |
| Invites            | `/invites/accept?token=…`                                    | Single-use, expiring, email-scoped                                        |
| API (Hono)         | `/api/*`                                                     | 28 OpenAPI-documented endpoints; Zod validation; RLS-scoped queries       |
| API console & docs | `/console`, `/api/docs`                                      | **Development only** — production returns 404                             |

## Quick start

```bash
bun install
(cd scripts/dev-stack && bun install)   # local Supabase binaries (~25 MB, once)
bun run stack:start                   # local Supabase — zero credentials needed
bun run dev                           # app + API on :3000
bun run db:seed                      # demo users: alex@example.com / sam@example.com (Password123!)
```

No cloud account required: the stack runs real Postgres 17, GoTrue and PostgREST locally and wires `.env` itself. To use hosted Supabase instead, see **[SETUP.md](./SETUP.md)** (Google OAuth lives there too).

Full setup — hosted Supabase, Google OAuth, deployment, security posture: **[SETUP.md](./SETUP.md)**.

## Scripts

| Script                                  | What it does                                       |
| --------------------------------------- | -------------------------------------------------- |
| `bun run dev`                           | Next.js dev server on :3000                        |
| `bun run build` / `start`               | Production build / run (standalone output)         |
| `bun run lint` / `typecheck` / `format` | eslint / tsc / prettier                            |
| `bun run db:seed`                       | Demo data into the configured Supabase project     |
| `bun run db:smoke`                      | OpenAPI contract smoke test                        |
| `bun run stack:start/stop/status/reset` | Local Supabase-compatible stack (see §Quick start) |
| `bun run stack:e2e`                     | Invite flow e2e against the stack                  |

Git hooks (husky): **pre-commit** lints + formats staged files; **pre-push** typechecks, lints, format-checks and runs a full production build before allowing a push.

## Architecture

```
Browser ── /api (Hono on the Next.js server) ── Supabase (Auth + Postgres + RLS)
                                                  (hosted, or the local dev stack
                                                   via scripts/dev-stack)
```

- **Auth**: Supabase JWTs as bearer tokens. Google OAuth and refresh-token rotation are proxied server-side (`/api/auth/oauth/*`, `/api/auth/refresh`). Sessions restore hydration-safely via `useSyncExternalStore`.
- **Data**: every query runs through a per-request Supabase client bound to the user's JWT — Postgres row-level security is the enforcement point, not the interface.

## Project layout

```
src/app/            routes — (marketing)/ group, /journal, /auth/callback, /invites, /console (dev-only), /api
src/server/         Hono app: routes, schemas, auth, rate limiting
src/components/     design system (ui/), journal workspace, marketing, landing, mood glyphs
src/lib/            api client + typed endpoints, session store, oauth
supabase/           SQL migrations (tables + RLS policies + triggers)
scripts/            db seed, OpenAPI smoke test, dev-stack/ (local Supabase)
```
