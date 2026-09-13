-- ============================================================================
-- 0005 — restrict group_invites reads to invitee + group owner.
--
-- The 0001 policy "group_invites: authenticated read" allowed ANY signed-in
-- user to SELECT every invite row (tokens + invited emails included). The
-- token is the capability, so full-table reads leak capabilities and allow
-- invite enumeration to users outside the group. Every app path still
-- works under the tighter rule:
--   - invitee accept/info-by-token: lower(email) matches their login email;
--   - owner list/revoke: is_group_owner(group_id);
--   - public pre-auth invite info: service-role client (bypasses RLS);
--   - group_members self-join check: touches only rows matching the joiner's
--     own email, so the sub-select keeps passing.
-- ============================================================================

drop policy if exists "group_invites: authenticated read" on public.group_invites;

create policy "group_invites: invitee or owner read"
  on public.group_invites for select
  using (
    lower(email) = public.get_my_email()
    or public.is_group_owner(group_invites.group_id)
  );

notify pgrst, 'reload schema';
