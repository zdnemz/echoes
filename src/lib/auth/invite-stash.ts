'use client'

/**
 * Pending-link stash — when an anonymous visitor opens an invite link, the
 * token is stashed in sessionStorage; the first successful sign-in (any
 * method: email, magic link, Google) sends them back to the accept page,
 * which finishes the join (instantly or as a request).
 */

const INVITE_STASH = 'echoes.pending-invite-link'

export interface StashedInvite {
  token: string
}

export function stashPendingInvite(info: StashedInvite): void {
  try {
    window.sessionStorage.setItem(INVITE_STASH, JSON.stringify(info))
  } catch {
    /* storage unavailable — link flow degrades to the manual page */
  }
}

export function popPendingInvite(): StashedInvite | null {
  try {
    const raw = window.sessionStorage.getItem(INVITE_STASH)
    return raw ? (JSON.parse(raw) as StashedInvite) : null
  } catch {
    return null
  }
}

export function clearPendingInvite(): void {
  try {
    window.sessionStorage.removeItem(INVITE_STASH)
  } catch {
    /* ignore */
  }
}
