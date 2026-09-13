-- ============================================================================
-- 0006 — backfill profiles for pre-migration users.
--
-- Accounts created before the migrations ran (or before the
-- on_auth_user_created trigger existed) have an auth.users row but no
-- public.profiles row. Since 0003, group_members.user_id references
-- profiles(id), so those users fail every group create/join with a 23503
-- foreign-key error surfaced as 409 CONFLICT. The trigger covers all
-- future signups; this heals the existing ones.
-- Idempotent: only inserts ids missing from profiles.
-- ============================================================================

insert into public.profiles (id, display_name)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'display_name', '')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

notify pgrst, 'reload schema';
