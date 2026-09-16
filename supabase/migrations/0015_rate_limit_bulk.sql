-- ============================================================================
-- 0015 — bulk rate-limit charging.
--
-- assertUserBudget runs on EVERY authenticated request, and rate_limit_consume
-- records exactly one hit per call — so a journal page load (a burst of 5-10
-- API calls inside a second) made that many Postgres round trips just to
-- charge the abuse ceiling. On a slow database that is most of the request
-- latency.
--
-- This adds a count-parameterised charger. The limiter now holds a short
-- in-process lease: the first request in the lease flushes every hit it has
-- accumulated in ONE call and re-reads the shared window; the rest of the
-- lease enforces against that snapshot plus local hits. Postgres still
-- receives every hit (in bulk), so the shared ceiling stays accurate across
-- instances — the lease only delays cross-instance visibility by its own
-- length, and each instance still caps itself at the configured max.
-- ============================================================================

-- Record p_count hits at once and report the window they land in.
create or replace function public.rate_limit_charge(p_bucket text, p_window_ms double precision, p_count integer)
returns table(hit_count bigint, oldest_at timestamptz)
language plpgsql
as $$
declare
  v_cutoff timestamptz := now() - (p_window_ms || ' milliseconds')::interval;
begin
  delete from public.rate_limit_hits where hit_at < v_cutoff;
  if p_count > 0 then
    insert into public.rate_limit_hits (bucket)
    select p_bucket from generate_series(1, p_count);
  end if;
  return query
    select count(*), min(hit_at) from public.rate_limit_hits
    where bucket = p_bucket and hit_at >= v_cutoff;
end;
$$;

notify pgrst, 'reload schema';
