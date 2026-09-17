-- ============================================================================
-- 0018 — A passkey as a second way to open the account key bundle.
--
-- The PIN stays the portable path (it re-derives the same KEK on any
-- device). A passkey binds one authenticator on one browser to the same
-- DEK: the WebAuthn PRF extension yields a stable 256-bit secret, the DEK
-- is wrapped under it, and only the wrapped blob plus the public salt and
-- credential id live here. The server can neither derive the PRF output
-- nor open the wrap; losing the authenticator loses nothing, the PIN
-- still opens the account everywhere.
-- ============================================================================

alter table public.profiles
  add column if not exists enc_passkey_salt text,
  add column if not exists enc_passkey_credential_id text,
  add column if not exists enc_passkey_wrapped_dek text;

notify pgrst, 'reload schema';
