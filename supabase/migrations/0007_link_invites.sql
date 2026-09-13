-- ============================================================================
-- 0007 — link invites + join requests (replaces email invites).
--
-- One active invite link per group (groups.invite_token, NULL = no link);
-- the link itself is the capability, no email addressing. Each group has an
-- auto_accept switch owned by the group owner:
--   - auto_accept = true   → visiting the link joins instantly;
--   - auto_accept = false  → visiting the link files a join request the
--                              owner approves or denies.
--
-- Writes on the link-scoped paths (join / request / approve / deny) go
-- through the API with the service role AFTER the token is validated
-- server-side — PostgREST cannot see the token, so RLS cannot gate on it.
-- RLS stays default-deny for those writes (no insert/update policies) and
-- governs all reads. The owner self-register path for group creation is
-- unchanged apart from losing its invite-email branch.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- groups: link state + auto-accept switch
-- ----------------------------------------------------------------------------
alter table public.groups
  add column if not exists auto_accept boolean not null default false;

alter table public.groups
  add column if not exists invite_token text;

alter table public.groups
  add column if not exists invite_expires_at timestamptz;

-- One active link per group; NULLs (no link) are mutually distinct.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'groups_invite_token_unique') then
    alter table public.groups add constraint groups_invite_token_unique unique (invite_token);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- group_join_requests — approval queue for manual-accept groups
-- ----------------------------------------------------------------------------
create table if not exists public.group_join_requests (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  status     text not null default 'pending'
             check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now()
);

-- At most one open request per user per group (re-request after a denial
-- is allowed — only concurrent pendings collide).
create unique index if not exists uq_join_requests_pending
  on public.group_join_requests (group_id, user_id)
  where status = 'pending';

-- Pending requests resolve exactly once, forward only.
create or replace function public.guard_group_join_requests_status()
returns trigger
language plpgsql
as $$
begin
  if (old.status = 'pending' and new.status in ('approved', 'denied')) then
    return new;
  end if;
  raise exception 'invalid join request status transition: % -> %', old.status, new.status
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists guard_group_join_requests_status on public.group_join_requests;
create trigger guard_group_join_requests_status
  before update of status on public.group_join_requests
  for each row execute function public.guard_group_join_requests_status();

alter table public.group_join_requests enable row level security;

-- Reads: your own requests, plus (as owner) your groups' queues.
drop policy if exists "group_join_requests: self or owner read" on public.group_join_requests;
create policy "group_join_requests: self or owner read"
  on public.group_join_requests for select
  using (
    user_id = auth.uid()
    or public.is_group_owner(group_join_requests.group_id)
  );

-- Owner cleanup of resolved rows (denied/approved history).
drop policy if exists "group_join_requests: owner delete" on public.group_join_requests;
create policy "group_join_requests: owner delete"
  on public.group_join_requests for delete
  using (public.is_group_owner(group_join_requests.group_id));

-- ----------------------------------------------------------------------------
-- group_members: owner self-register only (the invite-email branch dies
-- with the group_invites table below).
-- ----------------------------------------------------------------------------
drop policy if exists "group_members: self join via ownership or invite" on public.group_members;
create policy "group_members: owner self-register"
  on public.group_members for insert
  with check (
    user_id = auth.uid()
    and role = 'owner'
    and public.is_group_owner(group_members.group_id)
  );

-- ----------------------------------------------------------------------------
-- group_invites: retired (email addressing is gone).
-- ----------------------------------------------------------------------------
drop policy if exists "group_invites: authenticated read" on public.group_invites;
drop policy if exists "group_invites: owner insert" on public.group_invites;
drop policy if exists "group_invites: invitee accept" on public.group_invites;
drop policy if exists "group_invites: invitee accept or owner revoke" on public.group_invites;
drop policy if exists "group_invites: invitee or owner read" on public.group_invites;
drop policy if exists "group_invites: owner delete" on public.group_invites;
drop table if exists public.group_invites;

notify pgrst, 'reload schema';
