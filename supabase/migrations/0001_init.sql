-- ============================================================================
-- Journaling App — initial schema (Supabase Postgres)
-- Tables, indexes, triggers and Row Level Security policies.
--
-- The visibility rule (PRD §5):
--   A group member can read entries in any notebook linked to their group,
--   except entries with is_shared = false. A notebook's owner always sees
--   all of their own entries. Enforced HERE, in Postgres — not in the app.
-- ============================================================================

create extension if not exists pg_trgm;

-- ----------------------------------------------------------------------------
-- Helper: current user's email (lower-cased), readable inside RLS policies.
-- SECURITY DEFINER lets policies read auth.users without exposing the table.
-- ----------------------------------------------------------------------------
create or replace function public.get_my_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(email::text) from auth.users where id = auth.uid()
$$;

-- ----------------------------------------------------------------------------
-- updated_at maintenance
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- profiles — 1:1 with auth.users
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  created_at   timestamptz not null default now()
);

-- Auto-create a profile whenever an auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- groups
-- ----------------------------------------------------------------------------
create table if not exists public.groups (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- group_members — role is owner|member; a user can belong to many groups
-- ----------------------------------------------------------------------------
create table if not exists public.group_members (
  group_id   uuid not null references public.groups (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('owner', 'member')),
  joined_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- ----------------------------------------------------------------------------
-- notebooks — private by default; group_id is the share link (max one group)
-- ----------------------------------------------------------------------------
create table if not exists public.notebooks (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  title      text not null check (length(trim(title)) between 1 and 120),
  group_id   uuid references public.groups (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_notebooks_updated_at
  before update on public.notebooks
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- entries — markdown journal entries with mood + tags + per-entry share opt-out
-- ----------------------------------------------------------------------------
create table if not exists public.entries (
  id          uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references public.notebooks (id) on delete cascade,
  author_id   uuid not null references auth.users (id) on delete cascade,
  title       text not null default '' check (length(title) <= 200),
  body        text not null default '' check (length(body) <= 100000),
  mood        text check (mood in ('great', 'good', 'okay', 'low', 'rough')),
  tags        text[] not null default '{}',
  is_shared   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger set_entries_updated_at
  before update on public.entries
  for each row execute function public.set_updated_at();

create index if not exists idx_entries_notebook on public.entries (notebook_id, created_at desc);
create index if not exists idx_entries_author on public.entries (author_id, created_at desc);
create index if not exists idx_entries_tags on public.entries using gin (tags);
create index if not exists idx_entries_title_trgm on public.entries using gin (title gin_trgm_ops);
create index if not exists idx_entries_body_trgm on public.entries using gin (body gin_trgm_ops);
create index if not exists idx_notebooks_group on public.notebooks (group_id);
create index if not exists idx_group_members_user on public.group_members (user_id);

-- ----------------------------------------------------------------------------
-- group_invites — single-use, expiring tokens; the link itself is the action
-- ----------------------------------------------------------------------------
create table if not exists public.group_invites (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  email      text not null,
  token      text not null unique,
  status     text not null default 'pending'
             check (status in ('pending', 'accepted', 'expired', 'revoked')),
  invited_by uuid not null references auth.users (id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_group_invites_group on public.group_invites (group_id, created_at desc);

-- Only allow pending -> accepted (invitee), pending -> revoked (owner),
-- pending -> expired (sweeper). Blocks re-opening a consumed invite,
-- which preserves the single-use guarantee of invite tokens.
create or replace function public.guard_group_invites_status()
returns trigger
language plpgsql
as $$
begin
  if (old.status = 'pending' and new.status in ('accepted', 'revoked', 'expired')) then
    return new;
  end if;
  raise exception 'invalid invite status transition: % -> %', old.status, new.status
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists guard_group_invites_status on public.group_invites;
create trigger guard_group_invites_status
  before update of status on public.group_invites
  for each row execute function public.guard_group_invites_status();

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles      enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.notebooks     enable row level security;
alter table public.entries       enable row level security;
alter table public.group_invites enable row level security;

-- ----------------------------------- profiles --------------------------------
drop policy if exists "profiles: self read"    on public.profiles;
drop policy if exists "profiles: self insert" on public.profiles;
drop policy if exists "profiles: self update" on public.profiles;
drop policy if exists "profiles: comembers read" on public.profiles;

create policy "profiles: self read"
  on public.profiles for select
  using (auth.uid() = id);

-- Group co-members may see each other's display name (presence, member lists).
create policy "profiles: comembers read"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.group_members me
      join public.group_members them
        on me.group_id = them.group_id
      where me.user_id = auth.uid()
        and them.user_id = profiles.id
    )
  );

create policy "profiles: self insert"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles: self update"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ----------------------------------- groups ----------------------------------
drop policy if exists "groups: member read"  on public.groups;
drop policy if exists "groups: owner insert" on public.groups;
drop policy if exists "groups: owner update" on public.groups;
drop policy if exists "groups: owner delete" on public.groups;

create policy "groups: member read"
  on public.groups for select
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.group_members gm
      where gm.group_id = groups.id and gm.user_id = auth.uid()
    )
  );

create policy "groups: owner insert"
  on public.groups for insert
  with check (owner_id = auth.uid());

create policy "groups: owner update"
  on public.groups for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "groups: owner delete"
  on public.groups for delete
  using (owner_id = auth.uid());

-- -------------------------------- group_members ------------------------------
drop policy if exists "group_members: member read"      on public.group_members;
drop policy if exists "group_members: owner inserts via invite" on public.group_members;
drop policy if exists "group_members: self join via ownership or invite" on public.group_members;
drop policy if exists "group_members: owner or self delete" on public.group_members;

create policy "group_members: member read"
  on public.group_members for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.groups g
      where g.id = group_members.group_id and g.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.group_members me
      where me.group_id = group_members.group_id and me.user_id = auth.uid()
    )
  );

-- Membership rows are only ever inserted for YOURSELF, in two cases:
--   1. the group creator registers themselves as the owner member
--   2. a member joins through a pending, unexpired invite addressed to
--      their email — the API inserts the membership first, then flips the
--      invite to accepted; both as the user, so this policy is the gate.
-- Nobody can insert a membership for someone else (no consent bypass).
create policy "group_members: self join via ownership or invite"
  on public.group_members for insert
  with check (
    user_id = auth.uid()
    and (
      (
        role = 'owner'
        and exists (
          select 1 from public.groups g
          where g.id = group_members.group_id and g.owner_id = auth.uid()
        )
      )
      or (
        role = 'member'
        and exists (
          select 1 from public.group_invites gi
          where gi.group_id = group_members.group_id
            and gi.status = 'pending'
            and gi.expires_at > now()
            and lower(gi.email) = public.get_my_email()
        )
      )
    )
  );

-- Owner removes a member; any member removes themselves (leave).
create policy "group_members: owner or self delete"
  on public.group_members for delete
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.groups g
      where g.id = group_members.group_id and g.owner_id = auth.uid()
    )
  );

-- ---------------------------------- notebooks --------------------------------
drop policy if exists "notebooks: owner or member read" on public.notebooks;
drop policy if exists "notebooks: owner insert"         on public.notebooks;
drop policy if exists "notebooks: owner update"         on public.notebooks;
drop policy if exists "notebooks: owner delete"         on public.notebooks;

create policy "notebooks: owner or member read"
  on public.notebooks for select
  using (
    owner_id = auth.uid()
    or (
      group_id is not null
      and exists (
        select 1 from public.group_members gm
        where gm.group_id = notebooks.group_id and gm.user_id = auth.uid()
      )
    )
  );

create policy "notebooks: owner insert"
  on public.notebooks for insert
  with check (
    owner_id = auth.uid()
    and (
      group_id is null
      or exists (
        select 1 from public.group_members gm
        where gm.group_id = notebooks.group_id and gm.user_id = auth.uid()
      )
    )
  );

-- Only the notebook's owner renames / links / unlinks it, and may only link
-- it to a group they belong to.
create policy "notebooks: owner update"
  on public.notebooks for update
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (
      group_id is null
      or exists (
        select 1 from public.group_members gm
        where gm.group_id = notebooks.group_id and gm.user_id = auth.uid()
      )
    )
  );

create policy "notebooks: owner delete"
  on public.notebooks for delete
  using (owner_id = auth.uid());

-- ----------------------------------- entries ---------------------------------
drop policy if exists "entries: visibility rule" on public.entries;
drop policy if exists "entries: notebook owner insert" on public.entries;
drop policy if exists "entries: author update"   on public.entries;
drop policy if exists "entries: author delete"   on public.entries;

-- THE visibility rule from PRD §5.
create policy "entries: visibility rule"
  on public.entries for select
  using (
    -- the author always sees their own entries
    author_id = auth.uid()
    -- the notebook's owner sees everything in their notebook
    or exists (
      select 1 from public.notebooks n
      where n.id = entries.notebook_id and n.owner_id = auth.uid()
    )
    -- group members see shared entries of notebooks linked to their group
    or (
      entries.is_shared
      and exists (
        select 1
        from public.notebooks n
        join public.group_members gm on gm.group_id = n.group_id
        where n.id = entries.notebook_id
          and gm.user_id = auth.uid()
          and n.group_id is not null
      )
    )
  );

-- Entries are authored in the author's OWN notebooks (no co-editing in MVP).
create policy "entries: notebook owner insert"
  on public.entries for insert
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.notebooks n
      where n.id = entries.notebook_id and n.owner_id = auth.uid()
    )
  );

create policy "entries: author update"
  on public.entries for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "entries: author delete"
  on public.entries for delete
  using (author_id = auth.uid());

-- -------------------------------- group_invites -------------------------------
-- Tokens are unguessable 128-bit values, so possession of the token is the
-- capability. Any signed-in user may read invite rows they hold the token for.
drop policy if exists "group_invites: authenticated read" on public.group_invites;
drop policy if exists "group_invites: owner insert"       on public.group_invites;
drop policy if exists "group_invites: invitee accept"     on public.group_invites;
drop policy if exists "group_invites: invitee accept or owner revoke" on public.group_invites;
drop policy if exists "group_invites: owner delete"       on public.group_invites;

create policy "group_invites: authenticated read"
  on public.group_invites for select
  using (auth.uid() is not null);

create policy "group_invites: owner insert"
  on public.group_invites for insert
  with check (
    invited_by = auth.uid()
    and exists (
      select 1 from public.groups g
      where g.id = group_id and g.owner_id = auth.uid()
    )
  );

-- The invitee (matched by email) flips pending -> accepted when joining;
-- the group owner may flip pending -> revoked. The status-transition guard
-- trigger above restricts what either can actually do.
create policy "group_invites: invitee accept or owner revoke"
  on public.group_invites for update
  using (
    lower(email) = public.get_my_email()
    or exists (
      select 1 from public.groups g
      where g.id = group_invites.group_id and g.owner_id = auth.uid()
    )
  )
  with check (
    lower(email) = public.get_my_email()
    or exists (
      select 1 from public.groups g
      where g.id = group_invites.group_id and g.owner_id = auth.uid()
    )
  );

-- Group owner deletes (revokes) invite rows.
create policy "group_invites: owner delete"
  on public.group_invites for delete
  using (
    exists (
      select 1 from public.groups g
      where g.id = group_id and g.owner_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- Realtime publication (Postgres Changes) — used when the frontend subscribes
-- to Supabase Realtime directly. The socket.io service in this build listens
-- via the API publish events, but enabling this costs nothing and keeps the
-- Supabase-native path open.
-- ----------------------------------------------------------------------------
alter table public.entries replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.entries;
exception
  when duplicate_object then null;  -- already in the publication
  when undefined_object then null;  -- local Postgres without Supabase realtime
end $$;
