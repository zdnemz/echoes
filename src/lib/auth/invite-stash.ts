'use client'

/**
 * Pending-invite stash — when an anonymous visitor opens an invite link, the
 * token + invited email are stashed in sessionStorage; the first successful
 * sign-in (any method: email, magic link, Google) consumes the stash and
 * auto-joins the group (PRD §6.6).
 */

import type { InviteInfo } from '@/lib/api/types'

const INVITE_STASH = 'echoes.pending-invite'

export interface StashedInvite {
  token: string
  invited_email: string
}

export function stashPendingInvite(info: Pick<InviteInfo, 'token' | 'invited_email'>): void {
  try {
    window.sessionStorage.setItem(INVITE_STASH, JSON.stringify(info))
  } catch {
    /* storage unavailable — invite flow degrades to the manual page */
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
