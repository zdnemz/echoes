/**
 * Minimal tool loop for the Reflect agent — pure logic, no network.
 *
 * The route injects the chat function (OpenRouter) and the tool
 * implementations (RLS-scoped DB reads); this module only turns turns:
 * assistant message → dispatch tool calls → feed results back, until the
 * model answers directly or MAX_TURNS is hit. Pure, so bun test covers it
 * without mocks for HTTP or Postgres.
 */

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: Array<{ id: string; name: string; argsJson: string }>
  toolCallId?: string
}

export interface ToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>
  run: (args: Record<string, unknown>) => Promise<unknown>
}

export const MAX_TURNS = 4

export async function runAgentLoop(
  chat: (
    messages: AgentMessage[],
    tools: ToolDef[],
  ) => Promise<{ content: string; toolCalls: Array<{ id: string; name: string; argsJson: string }> }>,
  tools: ToolDef[],
  messages: AgentMessage[],
): Promise<{ reply: string; toolsUsed: string[] }> {
  const byName = new Map(tools.map((t) => [t.name, t]))
  const toolsUsed: string[] = []
  const thread = [...messages]

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const { content, toolCalls } = await chat(thread, tools)
    if (toolCalls.length === 0) {
      return { reply: content || 'I could not find the words — try asking another way?', toolsUsed }
    }
    thread.push({ role: 'assistant', content, toolCalls })
    for (const call of toolCalls) {
      const tool = byName.get(call.name)
      if (!tool) {
        thread.push({ role: 'tool', content: `unknown tool: ${call.name}`, toolCallId: call.id })
        continue
      }
      let result: unknown
      try {
        result = await tool.run(safeArgs(call.argsJson))
      } catch (err) {
        result = { error: err instanceof Error ? err.message : 'tool failed' }
      }
      toolsUsed.push(tool.name)
      thread.push({ role: 'tool', content: JSON.stringify(result).slice(0, 8000), toolCallId: call.id })
    }
  }
  // Out of turns — answer from what was gathered, without more tool calls.
  const { content } = await chat(thread, [])
  return { reply: content || 'I ran out of room to look — ask me about something smaller?', toolsUsed }
}

function safeArgs(json: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(json || '{}')
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
