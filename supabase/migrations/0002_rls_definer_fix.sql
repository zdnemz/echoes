-- ============================================================================
-- 0002 — fix RLS infinite recursion with SECURITY DEFINER helpers.
--
-- The 0001 policies referenced the RLS-protected tables themselves
-- (group_members "self-join" policies, groups ⇄ group_members cycles),
-- which makes Postgres abort every query with 42P17
-- "infinite recursion detected in policy". This would fail identically on
-- hosted Supabase — it was simply never exercised before a live database
-- existed.
--
-- The fix is the standard Supabase pattern: membership checks move into
-- SECURITY DEFINER functions (owned by the migration role = table owner,
-- so they read the tables WITHOUT re-entering RLS evaluation), and the
-- policies call those functions instead of sub-selecting the protected
-- tables directly. The visibility semantics from PRD §5 are unchanged.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper functions — owned by the table owner, RLS-safe by construction.
-- ----------------------------------------------------------------------------
create or replace function public.is_group_member(_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = _group_id
      and gm.user_id = auth.uid()
  )
$$;

create or replace function public.is_group_owner(_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.groups g
    where g.id = _group_id
      and g.owner_id = auth.uid()
  )
$$;

-- Do the current user and _other_user_id share at least one group?
create or replace function public.shares_group_with(_other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members me
    join public.group_members them on me.group_id = them.group_id
    where me.user_id = auth.uid()
      and them.user_id = _other_user_id
  )
$$;

-- ----------------------------------------------------------------------------
-- profiles: co-members see each other's display name.
-- ----------------------------------------------------------------------------
drop policy if exists "profiles: comembers read" on public.profiles;
create policy "profiles: comembers read"
  on public.profiles for select
  using (public.shares_group_with(profiles.id));

-- ----------------------------------------------------------------------------
-- groups
-- ----------------------------------------------------------------------------
drop policy if exists "groups: member read" on public.groups;
create policy "groups: member read"
  on public.groups for select
  using (
    owner_id = auth.uid()
    or public.is_group_member(groups.id)
  );

-- ----------------------------------------------------------------------------
-- group_members
-- ----------------------------------------------------------------------------
drop policy if exists "group_members: member read" on public.group_members;
create policy "group_members: member read"
  on public.group_members for select
  using (
    user_id = auth.uid()
    or public.is_group_owner(group_members.group_id)
    or public.is_group_member(group_members.group_id)
  );

-- Membership rows are only ever inserted for YOURSELF, in two cases:
--   1. the group creator registers themselves as the owner member
--   2. a member joins through a pending, unexpired invite addressed to
--      their email — the invite check reads group_invites, whose policies
--      only use definer helpers, so no recursion cycle exists.
drop policy if exists "group_members: self join via ownership or invite" on public.group_members;
create policy "group_members: self join via ownership or invite"
  on public.group_members for insert
  with check (
    user_id = auth.uid()
    and (
      (
        role = 'owner'
        and public.is_group_owner(group_members.group_id)
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

drop policy if exists "group_members: owner or self delete" on public.group_members;
create policy "group_members: owner or self delete"
  on public.group_members for delete
  using (
    user_id = auth.uid()
    or public.is_group_owner(group_members.group_id)
  );

-- ----------------------------------------------------------------------------
-- notebooks
-- ----------------------------------------------------------------------------
drop policy if exists "notebooks: owner or member read" on public.notebooks;
create policy "notebooks: owner or member read"
  on public.notebooks for select
  using (
    owner_id = auth.uid()
    or (
      group_id is not null
      and public.is_group_member(notebooks.group_id)
    )
  );

drop policy if exists "notebooks: owner insert" on public.notebooks;
create policy "notebooks: owner insert"
  on public.notebooks for insert
  with check (
    owner_id = auth.uid()
    and (
      group_id is null
      or public.is_group_member(notebooks.group_id)
    )
  );

drop policy if exists "notebooks: owner update" on public.notebooks;
create policy "notebooks: owner update"
  on public.notebooks for update
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (
      group_id is null
      or public.is_group_member(notebooks.group_id)
    )
  );

-- ----------------------------------------------------------------------------
-- entries — the visibility rule from PRD §5, same semantics.
-- The inner notebooks sub-selects stay: the notebooks policies themselves
-- only call definer helpers, so evaluating them from here cannot recurse.
-- ----------------------------------------------------------------------------
drop policy if exists "entries: visibility rule" on public.entries;
create policy "entries: visibility rule"
  on public.entries for select
  using (
    -- the author always sees their own entries
    author_id = auth.uid()
    -- the notebook's owner sees everything in their notebook
    or exists (
      select 1 from public.notebooks n
      where n.id = entries.notebook_id
        and n.owner_id = auth.uid()
    )
    -- group members see shared entries of notebooks linked to their group
    or (
      entries.is_shared
      and exists (
        select 1 from public.notebooks n
        where n.id = entries.notebook_id
          and n.group_id is not null
          and public.is_group_member(n.group_id)
      )
    )
  );

drop policy if exists "entries: notebook owner insert" on public.entries;
create policy "entries: notebook owner insert"
  on public.entries for insert
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.notebooks n
      where n.id = entries.notebook_id
        and n.owner_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- group_invites
-- ----------------------------------------------------------------------------
drop policy if exists "group_invites: owner insert" on public.group_invites;
create policy "group_invites: owner insert"
  on public.group_invites for insert
  with check (
    invited_by = auth.uid()
    and public.is_group_owner(group_id)
  );

drop policy if exists "group_invites: invitee accept or owner revoke" on public.group_invites;
create policy "group_invites: invitee accept or owner revoke"
  on public.group_invites for update
  using (
    lower(email) = public.get_my_email()
    or public.is_group_owner(group_invites.group_id)
  )
  with check (
    lower(email) = public.get_my_email()
    or public.is_group_owner(group_invites.group_id)
  );

drop policy if exists "group_invites: owner delete" on public.group_invites;
create policy "group_invites: owner delete"
  on public.group_invites for delete
  using (public.is_group_owner(group_id));
