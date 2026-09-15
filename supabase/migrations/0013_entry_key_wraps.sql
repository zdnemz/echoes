-- ============================================================================
-- 0013 — Per-entry content keys (dual-wrapped) for clean group rotation.
--
-- Why not seal entries directly under the group CEK: when a member is
-- removed, the CEK must rotate; re-sealing every entry body would require
-- every AUTHOR to be online (RLS lets only authors update their rows).
-- Instead each encrypted entry gets its own content key, stored in TWO
-- opaque wraps:
--   scope 'author' — content key sealed under the author's DEK (always)
--   scope 'group'  — content key sealed under the group CEK (shared entries)
--
-- Rotation then only re-wraps the 'group' rows (group OWNER can write
-- those by policy) — entry bodies never move. A removed member keeps no
-- path to future content: their CEK is dead once boxes rotate.
-- ============================================================================

create table if not exists public.entry_key_wraps (
  entry_id     uuid not null references public.entries (id) on delete cascade,
  scope        text not null check (scope in ('author', 'group')),
  wrapped_key  text not null,
  created_at   timestamptz not null default now(),
  primary key (entry_id, scope)
);

create index if not exists idx_entry_key_wraps_scope on public.entry_key_wraps (scope);

alter table public.entry_key_wraps enable row level security;

-- Read: the entry's author (their DEK wrap), or group members for the
-- group wrap of shared entries in notebooks linked to their group.
drop policy if exists "entry_key_wraps: read" on public.entry_key_wraps;
create policy "entry_key_wraps: read"
  on public.entry_key_wraps for select
  using (
    exists (
      select 1 from public.entries e
      where e.id = entry_key_wraps.entry_id and e.author_id = auth.uid()
    )
    or (
      scope = 'group'
      and exists (
        select 1
        from public.entries e
        join public.notebooks n on n.id = e.notebook_id
        join public.group_members gm on gm.group_id = n.group_id
        where e.id = entry_key_wraps.entry_id
          and e.is_shared
          and gm.user_id = auth.uid()
      )
    )
  );

-- Write: authors manage their own wraps; the group owner manages 'group'
-- wraps (rotation re-wraps other members' entries without their involvement).
drop policy if exists "entry_key_wraps: write" on public.entry_key_wraps;
create policy "entry_key_wraps: write"
  on public.entry_key_wraps for all
  using (
    exists (
      select 1 from public.entries e
      where e.id = entry_key_wraps.entry_id and e.author_id = auth.uid()
    )
    or (
      scope = 'group'
      and exists (
        select 1
        from public.entries e
        join public.notebooks n on n.id = e.notebook_id
        join public.groups g on g.id = n.group_id
        where e.id = entry_key_wraps.entry_id and g.owner_id = auth.uid()
      )
    )
  )
  with check (
    exists (
      select 1 from public.entries e
      where e.id = entry_key_wraps.entry_id and e.author_id = auth.uid()
    )
    or (
      scope = 'group'
      and exists (
        select 1
        from public.entries e
        join public.notebooks n on n.id = e.notebook_id
        join public.groups g on g.id = n.group_id
        where e.id = entry_key_wraps.entry_id and g.owner_id = auth.uid()
      )
    )
  );

notify pgrst, 'reload schema';
