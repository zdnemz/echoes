-- ============================================================================
-- 0009 — shared rate-limit hit store.
--
-- The limiter kept its windows in a per-process Map, so on multi-instance
-- deployments each instance enforced its own budget (N instances = N x the
-- configured limit, exactly when under attack). Hits now live in Postgres so
-- every instance charges the same buckets.
--
-- One round trip per decision via the functions below; the table stays tiny
-- because every window is <= 15 minutes and each consume prunes expired rows.
-- RLS is enabled with no policies (default-deny): only the service role —
-- which bypasses RLS — touches this table, always server-side.
-- ============================================================================

create table if not exists public.rate_limit_hits (
  bucket text not null,
  hit_at timestamptz not null default now()
);

create index if not exists ix_rate_limit_hits_bucket_at
  on public.rate_limit_hits (bucket, hit_at);

alter table public.rate_limit_hits enable row level security;

-- Record one hit and report the window: how many hits this bucket holds and
-- the oldest of them (for retry-after). Prunes expired rows first so the
-- table cannot grow beyond the longest window in use.
create or replace function public.rate_limit_consume(p_bucket text, p_window_ms double precision)
returns table(hit_count bigint, oldest_at timestamptz)
language plpgsql
as $$
declare
  v_cutoff timestamptz := now() - (p_window_ms || ' milliseconds')::interval;
begin
  delete from public.rate_limit_hits where hit_at < v_cutoff;
  insert into public.rate_limit_hits (bucket) values (p_bucket);
  return query
    select count(*), min(hit_at) from public.rate_limit_hits
    where bucket = p_bucket and hit_at >= v_cutoff;
end;
$$;

-- Read-only counterpart for pre-checks (the account bucket is consulted before
-- doing work, and charged only afterwards on failure).
create or replace function public.rate_limit_count(p_bucket text, p_window_ms double precision)
returns table(hit_count bigint, oldest_at timestamptz)
language sql
stable
as $$
  select count(*), min(hit_at) from public.rate_limit_hits
  where bucket = p_bucket and hit_at >= now() - (p_window_ms || ' milliseconds')::interval
$$;

notify pgrst, 'reload schema';
