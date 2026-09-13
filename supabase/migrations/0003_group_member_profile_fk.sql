-- ============================================================================
-- 0003 — make group_members → profiles embeddable (FK for PostgREST).
--
-- The group detail query embeds profiles(display_name) through
-- group_members ("who is in this group, by name"). PostgREST can only
-- embed across a detectable foreign-key relationship, but group_members
-- and profiles both point at auth.users — no direct FK existed, so every
-- group detail / rename / member-list query failed with
-- "Could not find a relationship between 'group_members' and 'profiles'".
-- (Same failure on hosted Supabase — caught by the live dev stack.)
--
-- profiles is 1:1 with auth.users, so a user_id → profiles(id) FK is
-- semantically identical to the existing auth.users FK; it additionally
-- gives PostgREST the relationship it needs. The original auth.users FK
-- is kept (renamed) so user deletion still cascades directly.
-- ============================================================================

alter table public.group_members
  rename constraint group_members_user_id_fkey to group_members_user_id_auth_fkey;

alter table public.group_members
  add constraint group_members_user_id_profile_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;
