-- ============================================================================
-- 0011 — entry view tracking.
--
-- Records which users have opened an entry's detail view. Used to show
-- WhatsApp-style blue read receipts in group chat and a "seen by" list in
-- the entry detail. One row per (entry, user) pair; re-opening updates the
-- timestamp.
-- ============================================================================

create table if not exists public.entry_views (
  entry_id   uuid not null references public.entries (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  viewed_at  timestamptz not null default now(),
  primary key (entry_id, user_id)
);

-- FK to profiles so PostgREST can embed display_name.
alter table public.entry_views
  add constraint entry_views_user_id_profile_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.entry_views enable row level security;

-- Readers: you can see views on entries you can already see.
create policy "entry_views: visible entries"
  on public.entry_views for select
  using (
    exists (
      select 1 from public.entries e where e.id = entry_views.entry_id
    )
  );

-- Writers: you can record your own view.
create policy "entry_views: self insert"
  on public.entry_views for insert
  with check (user_id = auth.uid());

-- Updaters: you can bump your own viewed_at.
create policy "entry_views: self update"
  on public.entry_views for update
  using (user_id = auth.uid());

-- Same as 0004: a new table is invisible to a running PostgREST until it
-- reloads its schema cache.
notify pgrst, 'reload schema';
