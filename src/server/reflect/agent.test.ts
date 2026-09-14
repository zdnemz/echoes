import { describe, expect, test } from 'bun:test'
import { MAX_TURNS, runAgentLoop, type AgentMessage, type ToolDef } from './agent'

/**
 * The turn-taking is the part of the agent that is easy to get subtly wrong
 * (infinite tool ping-pong, dropped tool results), so the pure loop is
 * checked here with a stubbed chat function — no network, no database.
 */

const tools: ToolDef[] = [
  {
    name: 'echo',
    description: 'echo',
    parameters: {},
    run: async (args) => ({ got: args }),
  },
]

const msg = (content: string): AgentMessage[] => [{ role: 'user', content }]

describe('runAgentLoop', () => {
  test('direct answer returns without touching tools', async () => {
    let calls = 0
    const { reply, toolsUsed } = await runAgentLoop(
      async () => {
        calls++
        return { content: 'hello', toolCalls: [] }
      },
      tools,
      msg('hi'),
    )
    expect(reply).toBe('hello')
    expect(toolsUsed).toEqual([])
    expect(calls).toBe(1)
  })

  test('tool result is fed back before the final answer', async () => {
    const seen: AgentMessage[][] = []
    const { reply, toolsUsed } = await runAgentLoop(
      async (thread) => {
        seen.push(thread)
        if (seen.length === 1) return { content: '', toolCalls: [{ id: 'c1', name: 'echo', argsJson: '{"a":1}' }] }
        return { content: 'done', toolCalls: [] }
      },
      tools,
      msg('hi'),
    )
    expect(reply).toBe('done')
    expect(toolsUsed).toEqual(['echo'])
    const toolMsg = seen[1].find((m) => m.role === 'tool')
    expect(toolMsg?.content).toContain('"a":1')
  })

  test('unknown tool names become tool errors, not crashes', async () => {
    const { reply } = await runAgentLoop(
      async (thread) => {
        if (thread.length === 1) return { content: '', toolCalls: [{ id: 'c1', name: 'nope', argsJson: '{}' }] }
        const toolMsg = thread.find((m) => m.role === 'tool')
        return { content: toolMsg?.content ?? 'missing', toolCalls: [] }
      },
      tools,
      msg('hi'),
    )
    expect(reply).toContain('unknown tool')
  })

  test('a model stuck on tools is cut off after MAX_TURNS', async () => {
    let calls = 0
    const { reply } = await runAgentLoop(
      async () => {
        calls++
        return { content: '', toolCalls: [{ id: `c${calls}`, name: 'echo', argsJson: '{}' }] }
      },
      tools,
      msg('hi'),
    )
    // MAX_TURNS tool rounds + 1 final answer round.
    expect(calls).toBe(MAX_TURNS + 1)
    expect(typeof reply).toBe('string')
  })
})
