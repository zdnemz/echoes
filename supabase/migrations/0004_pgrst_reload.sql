-- ============================================================================
-- Ask PostgREST to reload its schema cache.
--
-- PostgREST caches the database schema at startup; tables created by earlier
-- migrations are invisible to it until it reloads, and every query against
-- them fails with:
--   "Could not find the table 'public.<name>' in the schema cache" (PGRST205)
-- Supabase-hosted projects reload automatically, but self-hosted / local
-- PostgREST only reloads on SIGHUP or on this NOTIFY. Emitting it from a
-- migration makes `db push` / `migration up` self-healing: applying the
-- migrations also refreshes the cache, so notebook (and every other) writes
-- stop failing right after a deploy.
-- ============================================================================

notify pgrst, 'reload schema';
