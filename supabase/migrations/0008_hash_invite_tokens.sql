-- ============================================================================
-- 0008 — store invite link tokens as hashes.
--
-- Before this, groups.invite_token held the live capability in plaintext.
-- Anyone with a single read on `groups` — a future RLS gap, a leaked backup,
-- a log line, the GET /invites/link/{token} response — held every active join
-- capability, forever, because the token never expires on its own.
--
-- Now the database only stores sha256(token). The plaintext is returned
-- exactly once, at rotation time, and is not recoverable afterwards: the
-- owner-facing "current link" endpoint reports whether a link exists (and
-- when it expires) but never the link itself.
--
-- Consequences:
--   * DB read / backup / log exposure no longer leaks usable join links.
--   * The UI must capture the URL at rotation time — it cannot re-display it.
--   * Existing plaintext tokens are backfilled to hashes, so links issued
--     before this migration keep working.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Column
-- ----------------------------------------------------------------------------
alter table public.groups
  add column if not exists invite_token_hash text;

-- One active link per group; NULLs (no link) are mutually distinct.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'groups_invite_token_hash_unique') then
    alter table public.groups add constraint groups_invite_token_hash_unique unique (invite_token_hash);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Backfill: hash whatever plaintext tokens are already out there.
--
-- Postgres has no sha256() before 11 and pgcrypto is not guaranteed to be
-- installed, so use the built-in sha256() available on PG 11+ (this project
-- runs 17). convert_to(..., 'UTF8') → bytea → sha256 → hex.
-- ----------------------------------------------------------------------------
do $$
begin
  update public.groups
     set invite_token_hash = encode(sha256(convert_to(invite_token, 'UTF8')), 'hex')
   where invite_token is not null
     and (invite_token_hash is null or invite_token_hash = '');
end $$;

-- ----------------------------------------------------------------------------
-- Retire the plaintext column.
--
-- Kept out of the SELECT lists the API uses; dropped here so the secret
-- cannot linger in a column nobody reads anymore. Any code still selecting
-- it fails loudly at deploy time rather than silently carrying secrets.
-- ----------------------------------------------------------------------------
alter table public.groups
  drop column if exists invite_token;

-- The old unique constraint referenced the dropped column; ensure it is gone.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'groups_invite_token_unique') then
    alter table public.groups drop constraint groups_invite_token_unique;
  end if;
end $$;

notify pgrst, 'reload schema';
