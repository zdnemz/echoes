import { describe, expect, test } from 'bun:test'
import { providerChat, type AIConfig } from '../routes/reflect.routes'

describe('providerChat', () => {
  test('dispatches OpenAI-compatible requests and parses tool calls', async () => {
    let capturedBody: any = null
    let capturedHeaders: any = null

    const server = Bun.serve({
      port: 0,
      fetch(req) {
        capturedHeaders = Object.fromEntries(req.headers.entries())
        return req.json().then((b) => {
          capturedBody = b
          return Response.json({
            choices: [
              {
                message: {
                  content: 'Looking into entries...',
                  tool_calls: [
                    {
                      id: 'call-1',
                      type: 'function',
                      function: {
                        name: 'list_entries',
                        arguments: JSON.stringify({ notebook_id: 'nb-1', limit: 5 }),
                      },
                    },
                  ],
                },
              },
            ],
          })
        })
      },
    })

    try {
      const cfg: AIConfig = {
        apiKey: 'test-openai-key',
        entrypoint: `http://127.0.0.1:${server.port}/v1`,
        model: 'gpt-4o-mini',
        isAnthropic: false,
      }

      const res = await providerChat(
        cfg,
        [
          { role: 'system', content: 'You are an assistant.' },
          { role: 'user', content: 'What did I write?' },
        ],
        [
          {
            name: 'list_entries',
            description: 'list entries',
            parameters: { type: 'object' },
            run: async () => [],
          },
        ],
      )

      expect(capturedHeaders['authorization']).toBe('Bearer test-openai-key')
      expect(capturedBody.model).toBe('gpt-4o-mini')
      expect(capturedBody.messages).toHaveLength(2)
      expect(capturedBody.tools).toHaveLength(1)
      expect(res.content).toBe('Looking into entries...')
      expect(res.toolCalls).toHaveLength(1)
      expect(res.toolCalls[0].name).toBe('list_entries')
      expect(JSON.parse(res.toolCalls[0].argsJson)).toEqual({ notebook_id: 'nb-1', limit: 5 })
    } finally {
      server.stop()
    }
  })

  test('dispatches Anthropic-compatible requests and parses tool_use', async () => {
    let capturedBody: any = null
    let capturedHeaders: any = null

    const server = Bun.serve({
      port: 0,
      fetch(req) {
        capturedHeaders = Object.fromEntries(req.headers.entries())
        return req.json().then((b) => {
          capturedBody = b
          return Response.json({
            content: [
              { type: 'text', text: 'Checking your notes.' },
              {
                type: 'tool_use',
                id: 'toolu_01',
                name: 'list_entries',
                input: { notebook_id: 'nb-2' },
              },
            ],
          })
        })
      },
    })

    try {
      const cfg: AIConfig = {
        apiKey: 'test-anthropic-key',
        entrypoint: `http://127.0.0.1:${server.port}/v1/messages`,
        model: 'claude-3-5-haiku-20241022',
        isAnthropic: true,
      }

      const res = await providerChat(
        cfg,
        [
          { role: 'system', content: 'System prompt.' },
          { role: 'user', content: 'Tell me about today.' },
        ],
        [
          {
            name: 'list_entries',
            description: 'list entries',
            parameters: { type: 'object' },
            run: async () => [],
          },
        ],
      )

      expect(capturedHeaders['x-api-key']).toBe('test-anthropic-key')
      expect(capturedHeaders['anthropic-version']).toBe('2023-06-01')
      expect(capturedBody.model).toBe('claude-3-5-haiku-20241022')
      expect(capturedBody.system).toBe('System prompt.')
      expect(capturedBody.messages).toHaveLength(1)
      expect(capturedBody.tools).toHaveLength(1)
      expect(res.content).toBe('Checking your notes.')
      expect(res.toolCalls).toHaveLength(1)
      expect(res.toolCalls[0].name).toBe('list_entries')
      expect(JSON.parse(res.toolCalls[0].argsJson)).toEqual({ notebook_id: 'nb-2' })
    } finally {
      server.stop()
    }
  })
})
