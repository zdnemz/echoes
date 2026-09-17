-- ============================================================================
-- 0015 — Account-scoped keys unlocked by a PIN (the device registry retires).
--
-- Bug being fixed: keys used to live per-DEVICE (0014) — a random DEK + ECDH
-- identity in IndexedDB, with only the public key registered here. Signing in
-- on a second device minted brand-new keys that could never open the first
-- device's entries, and group CEK boxes were keyed on a device the new device
-- never had. Users lost their whole history on a device change.
--
-- Keys are now one bundle per ACCOUNT, stored here as opaque blobs:
--   enc_wrapped_dek        DEK, wrapped under KEK = PBKDF2-SHA256(PIN, salt)
--   enc_wrapped_private_key  ECDH identity private key, wrapped under the DEK
--   enc_public_key         ECDH identity public key (plain — sealers need it)
--   enc_salt/enc_iterations  the public KDF parameters
-- A device that knows the PIN re-derives the same KEK and recovers the exact
-- same keys, so it reads every entry the account owns. The server can never
-- derive the KEK: the PIN never leaves the browser. Forgetting the PIN loses
-- the entries by design — there is no recovery path and no backdoor.
--
-- group_key_wraps goes back to one box per (group, member): the member's
-- identity is now account-scoped and recoverable, so a box keyed on the USER
-- is openable from any of their devices. A removed member still keeps no path
-- to future content — rotation re-wraps the 'group' entry wraps (0013) and
-- their box is dropped.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- group_key_wraps: per-member boxes again
-- ----------------------------------------------------------------------------
alter table public.group_key_wraps drop constraint if exists group_key_wraps_pkey;
alter table public.group_key_wraps drop column if exists device_id;
alter table public.group_key_wraps add primary key (group_id, user_id);

-- Read: the member's own box; the owner sees every wrap of their groups
-- (needed to re-wrap on rotation after removing someone).
drop policy if exists "group_key_wraps: member or owner read" on public.group_key_wraps;
create policy "group_key_wraps: member or owner read"
  on public.group_key_wraps for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.groups g
      where g.id = group_key_wraps.group_id and g.owner_id = auth.uid()
    )
  );

-- Write: the owner distributes/rotates, AND any member who already holds the
-- CEK may seal a box for a member who lacks one (cooperative catch-up — the
-- owner is not always online when someone joins). Every member holds the CEK
-- by design once distributed, so letting one member write another's box is no
-- privilege escalation; the box is sealed to the recipient's public key and a
-- malicious member can only make an unopenable box, never read anyone's text.
drop policy if exists "group_key_wraps: member or owner write" on public.group_key_wraps;
create policy "group_key_wraps: member or owner write"
  on public.group_key_wraps for all
  using (
    exists (
      select 1 from public.groups g
      where g.id = group_key_wraps.group_id and g.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.group_members gm
      where gm.group_id = group_key_wraps.group_id and gm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.groups g
      where g.id = group_key_wraps.group_id and g.owner_id = auth.uid()
    )
    or exists (
      select 1 from public.group_members gm
      where gm.group_id = group_key_wraps.group_id and gm.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- user_devices: retired. Identity keys are account-scoped on profiles now.
-- ----------------------------------------------------------------------------
drop table if exists public.user_devices;

notify pgrst, 'reload schema';
