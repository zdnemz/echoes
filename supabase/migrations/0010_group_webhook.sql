-- ============================================================================
-- 0010 — group notification webhook url.
--
-- Group owners may configure an HTTP webhook URL (Discord, Slack, or generic)
-- that receives event notifications when someone asks to join, joins, leaves,
-- or reads entries in the group.
-- ============================================================================

alter table public.groups
  add column if not exists webhook_url text;
