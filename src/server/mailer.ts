import { getAppUrl } from './env'

/**
 * Email delivery interface.
 *
 * MVP: a dev-mode stub. Invite emails are LOGGED and the accept link is
 * returned in the API response instead of being sent. Swapping in a real
 * provider (Resend, Postmark, SES…) later means implementing this one
 * interface — nothing else in the codebase touches email.
 */

export interface InviteEmail {
  to: string
  groupName: string
  inviterName: string | null
  acceptUrl: string
}

export interface Mailer {
  sendInviteEmail(email: InviteEmail): Promise<{ delivered: boolean; devLink: string }>
}

const devMailer: Mailer = {
  async sendInviteEmail({ to, groupName, inviterName, acceptUrl }) {
    console.info(
      `[mailer:dev] invite email → ${to} | group: ${groupName} | from: ${inviterName ?? 'a group owner'} | accept: ${acceptUrl}`,
    )
    return { delivered: false, devLink: acceptUrl }
  },
}

let current: Mailer = devMailer

export function setMailer(mailer: Mailer): void {
  current = mailer
}

export function getMailer(): Mailer {
  return current
}

/** Build the public accept link for an invite token. */
export function inviteAcceptUrl(token: string): string {
  return `${getAppUrl()}/invites/accept?token=${encodeURIComponent(token)}`
}
