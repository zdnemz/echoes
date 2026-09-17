-- Cached Reflect (AI companion) replies.
--
-- A reflection for a given (user, notebooks, messages, entry context) is
-- deterministic enough to reuse: recomputing it costs up to five model calls
-- per request. Rows are keyed on sha256(user_id + scope + thread + context)
-- so the server never stores journal plaintext, only the model's reply.
--
-- A reply is derived from the user's own entries, so rows stay user-scoped:
-- the service client filters by user_id, and RLS is enabled as the
-- enforcement point of that rule.

create table if not exists public.reflect_cache (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  reply text not null,
  tools_used jsonb not null default '[]',
  model text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.reflect_cache enable row level security;

-- ponytail: no DELETE policy — expired rows are skipped on read by the
-- TTL filter and bounded to one row per (user, key). Add a scheduled
-- cleanup if this table shows meaningful bloat.

drop policy if exists "reflect_cache: own rows" on public.reflect_cache;
create policy "reflect_cache: own rows"
  on public.reflect_cache for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

notify pgrst, 'reload schema';
