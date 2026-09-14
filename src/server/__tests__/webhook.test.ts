import { describe, expect, test } from 'bun:test'
import { sendGroupWebhook, sendSeenWebhookThrottled } from '../webhook'

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

  test('formats Discord and Slack compatible payloads', async () => {
    let capturedUrl = ''
    let capturedBody: any = null

    // Spin up a local server mock
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

    try {
      const webhookUrl = `http://127.0.0.1:${server.port}/webhook`
      await sendGroupWebhook(
        { id: 'group-1', name: 'Hiking Circle', webhook_url: webhookUrl },
        'group.join_requested',
        { id: 'user-2', display_name: 'Bob' },
      )

      expect(capturedUrl).toContain('/webhook')
      expect(capturedBody).not.toBeNull()
      expect(capturedBody.event).toBe('group.join_requested')
      expect(capturedBody.group).toEqual({ id: 'group-1', name: 'Hiking Circle' })
      expect(capturedBody.user).toEqual({ id: 'user-2', display_name: 'Bob', email: null })
      expect(capturedBody.content).toContain('Bob')
      expect(capturedBody.content).toContain('Hiking Circle')
      expect(capturedBody.text).toBe(capturedBody.content)
    } finally {
      server.stop()
    }
  })

  test('swallows fetch failures without throwing', async () => {
    const invalidUrl = 'http://127.0.0.1:1/invalid' // port 1 will reject
    await expect(
      sendGroupWebhook({ id: 'group-1', name: 'Family', webhook_url: invalidUrl }, 'group.member_left', {
        id: 'user-3',
        email: 'left@example.com',
      }),
    ).resolves.toBeUndefined()
  })

  test('throttles repeated entry_seen notifications', async () => {
    let hitCount = 0
    const server = Bun.serve({
      port: 0,
      fetch() {
        hitCount++
        return new Response('ok')
      },
    })

    try {
      const webhookUrl = `http://127.0.0.1:${server.port}/webhook`
      const target = { id: 'group-throttled', name: 'Chat', webhook_url: webhookUrl }
      const user = { id: 'user-throttle-1', email: 'test@example.com' }

      sendSeenWebhookThrottled(target, user)
      sendSeenWebhookThrottled(target, user)
      sendSeenWebhookThrottled(target, user)

      await new Promise((r) => setTimeout(r, 50))
      expect(hitCount).toBe(1)
    } finally {
      server.stop()
    }
  })
})
