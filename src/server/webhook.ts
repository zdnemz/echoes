import { getServiceClient } from './supabase'

/**
 * SSRF guard for outbound webhooks: https only, no credentials in the URL,
 * and no hostnames that resolve into private/reserved space. DNS is not
 * re-resolved at send time (a determined owner could rotate DNS after
 * validation) — ponytail: strict egress proxy or IP-pinned fetch if this
 * ever becomes a multi-tenant concern.
 */
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|::ffff:)/i

/** Test seam: lets the suite exercise delivery against a loopback mock. */
export const __testHooks = {
  allowAllUrls: false,
}

export function isSafeWebhookUrl(raw: string): boolean {
  if (__testHooks.allowAllUrls) return true
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return false
    if (url.username || url.password) return false
    if (PRIVATE_HOST.test(url.hostname)) return false
    // Dotless intranet hostnames (e.g. http://internal/) — https requires a
    // dot anyway; reject hostnames without one to catch bare TLD-less names.
    if (!url.hostname.includes('.')) return false
    return true
  } catch {
    return false
  }
}
export type GroupWebhookEvent =
  'group.join_requested' | 'group.member_joined' | 'group.member_left' | 'group.entry_seen'

export interface WebhookUser {
  id: string
  display_name?: string | null
  email?: string | null
}

export interface GroupWebhookTarget {
  id: string
  name?: string
  webhook_url?: string | null
}

// Throttle for entry_seen webhooks so rapid scroll ticks don't flood the destination
const lastSeenWebhook = new Map<string, number>()

/**
 * Dispatch an outbound webhook notification for a group event.
 * Non-blocking, fails gracefully without throwing. Formats payloads to be
 * compatible with Discord, Slack, and generic JSON webhook receivers.
 */
export async function sendGroupWebhook(
  target: string | GroupWebhookTarget,
  event: GroupWebhookEvent,
  user?: WebhookUser | null,
): Promise<void> {
  let webhookUrl: string | null = null
  let groupName = 'Group'
  let groupId: string

  if (typeof target === 'string') {
    groupId = target
    const service = getServiceClient()
    if (!service) return
    const { data } = await service.from('groups').select('name, webhook_url').eq('id', groupId).maybeSingle()
    if (!data?.webhook_url) return
    webhookUrl = data.webhook_url
    groupName = data.name || 'Group'
  } else {
    groupId = target.id
    webhookUrl = target.webhook_url ?? null
    groupName = target.name || 'Group'
  }

  if (!webhookUrl) return
  if (!isSafeWebhookUrl(webhookUrl)) return
  const finalUrl: string = webhookUrl

  const userName = user?.display_name || user?.email || 'A user'
  let summary = ''
  switch (event) {
    case 'group.join_requested':
      summary = `🔔 **${userName}** requested to join **${groupName}**`
      break
    case 'group.member_joined':
      summary = `👋 **${userName}** joined **${groupName}**`
      break
    case 'group.member_left':
      summary = `🚪 **${userName}** left **${groupName}**`
      break
    case 'group.entry_seen':
      summary = `👀 **${userName}** read messages in **${groupName}**`
      break
  }

  const payload = {
    event,
    group: { id: groupId, name: groupName },
    user: user ? { id: user.id, display_name: user.display_name ?? null, email: user.email ?? null } : null,
    summary,
    content: summary, // Discord webhook format
    text: summary, // Slack incoming webhook format
    timestamp: new Date().toISOString(),
  }

  try {
    const res = await fetch(finalUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4000),
    })
    // Drain body to release socket
    await res.text().catch(() => {})
  } catch {
    // Best-effort delivery — never throw or interrupt the caller
  }
}

/**
 * Throttled wrapper for read receipt notifications (at most once every 15s per user per group).
 */
export function sendSeenWebhookThrottled(target: string | GroupWebhookTarget, user?: WebhookUser | null): void {
  const groupId = typeof target === 'string' ? target : target.id
  const userId = user?.id || 'anon'
  const key = `${groupId}:${userId}`
  const now = Date.now()
  const last = lastSeenWebhook.get(key) ?? 0
  if (now - last < 15_000) return
  lastSeenWebhook.set(key, now)
  void sendGroupWebhook(target, 'group.entry_seen', user)
}
