-- ============================================================================
-- 0012 — End-to-end encryption: client-side key material storage.
--
-- The server stores ONLY opaque blobs it cannot decrypt:
--   profiles.enc_*        — the user's DEK (wrapped under a password-derived
--                           key) and ECDH identity keys (private key wrapped
--                           under the DEK, public key plain). The password
--                           never travels; PBKDF2 runs in the browser.
--   group_key_wraps       — per-member sealed boxes carrying the group CEK,
--                           relayed by the owner, openable only by the
--                           recipient's identity key.
--   entries               — ciphertext moves into body_enc (base64 v1 envelope)
--                           with encrypted=1; body stays for legacy plaintext
--                           rows until the client-driven migration rewrites
--                           them. Kept in-place so RLS policies, indexes and
--                           sorting (created_at, mood, tags) stay untouched.
--
-- Search across encrypted bodies becomes client-side; the pg_trgm indexes on
-- body/title remain for the plaintext window only.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles: key material (all opaque to the server)
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists enc_salt         text,
  add column if not exists enc_iterations   integer not null default 600000,
  add column if not exists enc_wrapped_dek  text,
  add column if not exists enc_public_key   text,
  add column if not exists enc_wrapped_private_key text;

-- ----------------------------------------------------------------------------
-- group_key_wraps: one sealed box per (group, member, generation)
-- ----------------------------------------------------------------------------
create table if not exists public.group_key_wraps (
  group_id    uuid not null references public.groups (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  generation  integer not null default 1,
  sealed_box  text not null,
  created_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists idx_group_key_wraps_user on public.group_key_wraps (user_id);

alter table public.group_key_wraps enable row level security;

-- A member sees the sealed box addressed to them; the owner sees all wraps
-- for groups they own (needed to re-wrap on rotation after removing someone).
drop policy if exists "group_key_wraps: member or owner read" on public.group_key_wraps;
create policy "group_key_wraps: member or owner read"
  on public.group_key_wraps for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.groups g
      where g.id = group_key_wraps.group_id and g.owner_id = auth.uid()
    )
  );

-- Only the group owner may write wraps (distribution + rotation); users
-- can never inject a box for someone else.
drop policy if exists "group_key_wraps: owner write" on public.group_key_wraps;
create policy "group_key_wraps: owner write"
  on public.group_key_wraps for all
  using (
    exists (
      select 1 from public.groups g
      where g.id = group_key_wraps.group_id and g.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.groups g
      where g.id = group_key_wraps.group_id and g.owner_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- entries: encrypted payloads live beside plaintext until migration
-- ----------------------------------------------------------------------------
alter table public.entries
  add column if not exists encrypted boolean not null default false;

-- Ciphertext can exceed the old 100k plaintext cap by the envelope overhead.
alter table public.entries
  drop constraint if exists entries_body_len;
alter table public.entries
  add constraint entries_body_len check (length(body) <= 140000);

-- Partial index: encrypted-row lookups during the client migration stay cheap.
create index if not exists idx_entries_unencrypted
  on public.entries (author_id, created_at desc)
  where not encrypted;
