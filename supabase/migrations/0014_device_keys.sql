-- ============================================================================
-- 0014 — Per-device keys: end-to-end encryption without a password.
--
-- Keys are no longer derived from the login password. Each device generates
-- its own DEK + ECDH identity keypair on first load and keeps them in
-- IndexedDB; only the public key is registered here, so group CEKs can be
-- sealed to every device a member actually uses.
--
-- group_key_wraps therefore moves from one box per (group, user) to one box
-- per (group, device). Existing per-user boxes are backfilled onto a
-- recovered device row carrying the public key already on the profile, so a
-- deployed database keeps working without any client action.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- user_devices — one row per browser/device that holds a key pair
-- ----------------------------------------------------------------------------
create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  public_key text not null,
  label text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_user_devices_user on public.user_devices(user_id);

alter table public.user_devices enable row level security;

-- Read: your own devices, plus devices of anyone you share a group with —
-- sealing a group key needs the public key of every member device. Public
-- keys are not secret, and co-membership is the gate.
drop policy if exists "user_devices: read own or co-member" on public.user_devices;
create policy "user_devices: read own or co-member"
  on public.user_devices for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.group_members a
      join public.group_members b on a.group_id = b.group_id
      where a.user_id = user_devices.user_id and b.user_id = auth.uid()
    )
  );

drop policy if exists "user_devices: manage own" on public.user_devices;
create policy "user_devices: manage own"
  on public.user_devices for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- group_key_wraps: add device_id and backfill from the profile public key
-- ----------------------------------------------------------------------------
alter table public.group_key_wraps
  add column if not exists device_id uuid references public.user_devices(id) on delete cascade;

-- One recovered device per user that already had a box, carrying the key
-- their existing sealed boxes were sealed to.
insert into public.user_devices (user_id, public_key, label)
select distinct gkw.user_id, p.enc_public_key, 'recovered'
from public.group_key_wraps gkw
join public.profiles p on p.id = gkw.user_id
where p.enc_public_key is not null
  and not exists (
    select 1 from public.user_devices d
    where d.user_id = gkw.user_id and d.public_key = p.enc_public_key
  );

update public.group_key_wraps gkw
set device_id = d.id
from public.user_devices d
where gkw.device_id is null
  and d.user_id = gkw.user_id
  and d.id = (
    select d2.id from public.user_devices d2
    where d2.user_id = gkw.user_id
    order by d2.created_at
    limit 1
  );

-- A wrap with no device to attach to cannot be opened by anyone — drop it.
delete from public.group_key_wraps where device_id is null;

alter table public.group_key_wraps alter column device_id set not null;

alter table public.group_key_wraps drop constraint if exists group_key_wraps_pkey;
alter table public.group_key_wraps add primary key (group_id, device_id);

-- ----------------------------------------------------------------------------
-- Policies: unchanged in spirit, but a member may also write a box for one of
-- their own devices so a fresh device can be brought into an existing group
-- without the owner being online.
-- ----------------------------------------------------------------------------
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

drop policy if exists "group_key_wraps: owner write" on public.group_key_wraps;
create policy "group_key_wraps: owner write"
  on public.group_key_wraps for all
  using (
    exists (
      select 1 from public.groups g
      where g.id = group_key_wraps.group_id and g.owner_id = auth.uid()
    )
    or user_id = auth.uid()
  )
  with check (
    exists (
      select 1 from public.groups g
      where g.id = group_key_wraps.group_id and g.owner_id = auth.uid()
    )
    or user_id = auth.uid()
  );
