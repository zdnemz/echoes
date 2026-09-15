import { describe, expect, test } from 'bun:test'
import { __testHooks, isSafeWebhookUrl, sendGroupWebhook, sendSeenWebhookThrottled } from '../webhook'

describe('webhook dispatcher', () => {
  test('does nothing if no webhook_url is set', async () => {
    // Should resolve without attempting network fetch
    await expect(
      sendGroupWebhook({ id: 'group-1', name: 'Family', webhook_url: null }, 'group.member_joined', {
        id: 'user-1',
        email: 'user@example.com',
      }),
    ).resolves.toBeUndefined()
  })

  test('SSRF guard: rejects private, http, and dotless webhook targets', () => {
    expect(isSafeWebhookUrl('http://127.0.0.1:8080/hook')).toBe(false) // not https
    expect(isSafeWebhookUrl('https://localhost/hook')).toBe(false) // private host
    expect(isSafeWebhookUrl('https://127.0.0.1/hook')).toBe(false)
    expect(isSafeWebhookUrl('https://10.0.0.5/hook')).toBe(false)
    expect(isSafeWebhookUrl('https://192.168.1.4/hook')).toBe(false)
    expect(isSafeWebhookUrl('https://169.254.169.254/latest/meta-data')).toBe(false) // cloud metadata
    expect(isSafeWebhookUrl('https://172.20.0.9/hook')).toBe(false)
    expect(isSafeWebhookUrl('https://internal/hook')).toBe(false) // dotless intranet name
    expect(isSafeWebhookUrl('https://user:pass@hooks.example.com/hook')).toBe(false) // creds in URL
    expect(isSafeWebhookUrl('https://hooks.example.com/hook')).toBe(true)
    expect(isSafeWebhookUrl('https://discord.com/api/webhooks/123/xyz')).toBe(true)
  })

  test('refuses to deliver to blocked (private/http) webhook targets', async () => {
    let hit = false
    const server = Bun.serve({
      port: 0,
      fetch() {
        hit = true
        return new Response('ok')
      },
    })
    try {
      // Even though the target is a live local server, the SSRF guard stops
      // the delivery before any fetch happens.
      await sendGroupWebhook(
        { id: 'g', name: 'X', webhook_url: `http://127.0.0.1:${server.port}/hook` },
        'group.member_joined',
        { id: 'u' },
      )
      await new Promise((r) => setTimeout(r, 30))
      expect(hit).toBe(false)
    } finally {
      server.stop()
    }
  })

  test('formats Discord and Slack compatible payloads', async () => {
    let capturedUrl = ''
    let capturedBody: any = null

    // Spin up a local server mock. Delivery to loopback is guarded in
    // production; the test bypasses the guard by stubbing the checker.
    const server = Bun.serve({
      port: 0,
      fetch(req) {
        capturedUrl = req.url
        return req.json().then((b) => {
          capturedBody = b
          return new Response('ok', { status: 200 })
        })
      },
    })

    const original = __testHooks.allowAllUrls
    __testHooks.allowAllUrls = true
    try {
      const webhookUrl = `http://127.0.0.1:${server.port}/webhook`
      await sendGroupWebhook(
        { id: 'group-1', name: 'Hiking Circle', webhook_url: webhookUrl },
        'group.join_requested',
        { id: 'user-2', display_name: 'Bob' },
      )
      __testHooks.allowAllUrls = original

      expect(capturedUrl).toContain('/webhook')
      expect(capturedBody).not.toBeNull()
      expect(capturedBody.event).toBe('group.join_requested')
      expect(capturedBody.group).toEqual({ id: 'group-1', name: 'Hiking Circle' })
      expect(capturedBody.user).toEqual({ id: 'user-2', display_name: 'Bob', email: null })
      expect(capturedBody.content).toContain('Bob')
      expect(capturedBody.content).toContain('Hiking Circle')
      expect(capturedBody.text).toBe(capturedBody.content)
    } finally {
      __testHooks.allowAllUrls = original
      server.stop()
    }
  })

  test('throttles repeated entry_seen notifications', async () => {
    let hitCount = 0
    const server = Bun.serve({
      port: 0,
      fetch() {
        hitCount += 1
        return new Response('ok')
      },
    })

    const original = __testHooks.allowAllUrls
    __testHooks.allowAllUrls = true
    try {
      const target = { id: 'group-9', name: 'Book Club', webhook_url: `http://127.0.0.1:${server.port}/hook` }
      const user = { id: 'user-9', display_name: 'Zoe' }

      sendSeenWebhookThrottled(target, user)
      sendSeenWebhookThrottled(target, user)
      sendSeenWebhookThrottled(target, user)

      await new Promise((r) => setTimeout(r, 50))
      expect(hitCount).toBe(1)
    } finally {
      __testHooks.allowAllUrls = original
      server.stop()
    }
  })
})
