import { createRoute, z } from '@hono/zod-openapi'
import type { SupabaseClient } from '@supabase/supabase-js'
import { UuidSchema } from '../schemas'
import { ApiError, Errors, fromPostgrestError } from '../errors'
import { requireAuth } from '../auth'
import { getAppUrl } from '../env'
import { bearerAuth, errorResponses, jsonBody, type App } from './helpers'
import { escapePostgrestValue } from './search.routes'
import { runAgentLoop, type AgentMessage, type ToolDef } from '../reflect/agent'

/**
 * Reflect — a journaling companion with a small tool loop.
 *
 * Stateless per request (no chat memory on the server): the client sends the
 * visible history, the agent may call read-only tools over the notebooks the
 * user explicitly selected — always their own, verified below — then answers.
 * Model + key come from the server environment so the key never reaches the
 * browser; default model is OpenRouter's free router.
 */

const DEFAULT_MODEL = 'openai/gpt-4o-mini'

function getAIConfig(): { apiKey: string; model: string } | null {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) return null
  return { apiKey, model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL }
}

function aiNotConfigured(): ApiError {
  return new ApiError(
    503,
    'AI_NOT_CONFIGURED',
    'The AI companion is not set up on this deployment yet — add OPENROUTER_API_KEY to .env',
  )
}

const preview = (body: string, max = 160) => body.replace(/\s+/g, ' ').trim().slice(0, max)

function buildTools(client: SupabaseClient, ownedIds: Set<string>): ToolDef[] {
  const guardNotebook = (id: unknown) => {
    if (typeof id !== 'string' || !ownedIds.has(id)) throw new Error('notebook not in scope')
    return id
  }
  return [
    {
      name: 'list_entries',
      description: 'List recent entries (title, date, mood, tags, preview) in one of the selected notebooks.',
      parameters: {
        type: 'object',
        properties: {
          notebook_id: { type: 'string', description: 'One of the selected notebook ids' },
          limit: { type: 'integer', minimum: 1, maximum: 20, default: 8 },
        },
        required: ['notebook_id'],
      },
      run: async (args) => {
        const notebook_id = guardNotebook(args.notebook_id)
        const limit = Math.min(20, Math.max(1, (args.limit as number) || 8))
        const { data, error } = await client
          .from('entries')
          .select('id, title, mood, tags, created_at, body')
          .eq('notebook_id', notebook_id)
          .order('created_at', { ascending: false })
          .limit(limit)
        if (error) throw fromPostgrestError(error)
        return ((data ?? []) as Array<{ body: string } & Record<string, unknown>>).map((e) => ({
          ...e,
          preview: preview(e.body),
          body: undefined,
        }))
      },
    },
    {
      name: 'read_entry',
      description: 'Read one full entry by id (only from the selected notebooks).',
      parameters: {
        type: 'object',
        properties: { entry_id: { type: 'string' } },
        required: ['entry_id'],
      },
      run: async (args) => {
        if (typeof args.entry_id !== 'string') throw new Error('entry_id required')
        const { data, error } = await client
          .from('entries')
          .select('id, notebook_id, title, body, mood, tags, created_at')
          .eq('id', args.entry_id)
          .maybeSingle()
        if (error) throw fromPostgrestError(error)
        const row = data as { notebook_id: string } | null
        if (!row || !ownedIds.has(row.notebook_id)) throw new Error('entry not in scope')
        return data
      },
    },
    {
      name: 'search_entries',
      description: 'Search the selected notebooks by keyword in title and body.',
      parameters: {
        type: 'object',
        properties: {
          q: { type: 'string', minLength: 1, maxLength: 200 },
          limit: { type: 'integer', minimum: 1, maximum: 20, default: 8 },
        },
        required: ['q'],
      },
      run: async (args) => {
        if (typeof args.q !== 'string' || !args.q.trim()) throw new Error('q required')
        const limit = Math.min(20, Math.max(1, (args.limit as number) || 8))
        const like = escapePostgrestValue(`%${args.q.trim()}%`)
        const { data, error } = await client
          .from('entries')
          .select('id, notebook_id, title, created_at, body, notebooks!inner(id)')
          .in('notebook_id', [...ownedIds])
          .or(`title.ilike.${like},body.ilike.${like}`)
          .order('created_at', { ascending: false })
          .limit(limit)
        if (error) throw fromPostgrestError(error)
        return ((data ?? []) as Array<{ body: string; notebooks?: unknown } & Record<string, unknown>>).map((e) => {
          const { notebooks: _j, body, ...rest } = e
          void _j
          return { ...rest, preview: preview(body) }
        })
      },
    },
    {
      name: 'mood_stats',
      description: 'Count entries per mood across the selected notebooks, optionally since an ISO date.',
      parameters: {
        type: 'object',
        properties: { since: { type: 'string', description: 'ISO date, e.g. 2026-08-01' } },
      },
      run: async (args) => {
        let query = client
          .from('entries')
          .select('mood')
          .in('notebook_id', [...ownedIds])
        if (typeof args.since === 'string' && args.since) query = query.gte('created_at', args.since)
        const { data, error } = await query.limit(500)
        if (error) throw fromPostgrestError(error)
        const counts: Record<string, number> = {}
        for (const row of (data ?? []) as Array<{ mood: string | null }>) {
          counts[row.mood ?? 'none'] = (counts[row.mood ?? 'none'] ?? 0) + 1
        }
        return counts
      },
    },
  ]
}

async function openRouterChat(
  apiKey: string,
  model: string,
  messages: AgentMessage[],
  tools: ToolDef[],
): Promise<{ content: string; toolCalls: Array<{ id: string; name: string; argsJson: string }> }> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'HTTP-Referer': getAppUrl(),
      'X-Title': 'Echoes Reflect',
    },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => {
        if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, content: m.content }
        if (m.role === 'assistant' && m.toolCalls?.length) {
          return {
            role: 'assistant',
            content: m.content || null,
            tool_calls: m.toolCalls.map((t) => ({
              id: t.id,
              type: 'function',
              function: { name: t.name, arguments: t.argsJson },
            })),
          }
        }
        return { role: m.role, content: m.content }
      }),
      ...(tools.length > 0
        ? {
            tools: tools.map((t) => ({
              type: 'function',
              function: { name: t.name, description: t.description, parameters: t.parameters },
            })),
          }
        : {}),
    }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw aiNotConfigured()
    if (res.status === 429) {
      throw new ApiError(429, 'AI_RATE_LIMITED', 'The free model is rate-limited right now — wait a minute and retry.')
    }
    const text = await res.text().catch(() => '')
    throw new ApiError(502, 'AI_UPSTREAM', `The model provider failed (${res.status}): ${text.slice(0, 200)}`)
  }
  const body = (await res.json()) as {
    model?: string
    choices?: Array<{
      message?: {
        content?: string | null
        tool_calls?: Array<{ id: string; function?: { name?: string; arguments?: string } }>
      }
    }>
  }
  const msg = body.choices?.[0]?.message
  if (!msg) throw new ApiError(502, 'AI_UPSTREAM', 'The model provider returned an empty response')
  void body.model
  return {
    content: msg.content ?? '',
    toolCalls: (msg.tool_calls ?? []).map((t) => ({
      id: t.id,
      name: t.function?.name ?? '',
      argsJson: t.function?.arguments ?? '{}',
    })),
  }
}

const ChatBody = z
  .object({
    notebook_ids: z.array(UuidSchema).min(1).max(10),
    messages: z
      .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(2000) }))
      .min(1)
      .max(20),
  })
  .strict()

export function registerReflectRoutes(app: App) {
  const chat = createRoute({
    method: 'post',
    path: '/reflect/chat',
    tags: ['Reflect'],
    summary: 'Ask the journaling companion (tool loop over notebooks you pick)',
    security: [bearerAuth],
    middleware: [requireAuth],
    request: { body: jsonBody(ChatBody) },
    responses: {
      ...errorResponses(400, 401, 422, 429, 502, 503),
      200: {
        description: 'Companion reply with the tools it consulted',
        content: {
          'application/json': {
            schema: z.object({ reply: z.string(), tools_used: z.array(z.string()), model: z.string() }),
          },
        },
      },
    },
  })

  app.openapi(chat, async (c) => {
    const cfg = getAIConfig()
    if (!cfg) throw aiNotConfigured()
    const { notebook_ids, messages } = c.req.valid('json')
    const me = c.var.user.id

    // Scope: only notebooks the caller owns. Anything else reads as 404 so
    // ids cannot be probed.
    const { data: nbs, error: nbError } = await c.var.userClient
      .from('notebooks')
      .select('id, owner_id, title')
      .in('id', notebook_ids)
    if (nbError) throw fromPostgrestError(nbError)
    const owned = (nbs ?? []) as Array<{ id: string; owner_id: string; title: string }>
    if (owned.length !== notebook_ids.length || owned.some((n) => n.owner_id !== me)) {
      throw Errors.notFound('Notebook not found (or not visible to you)')
    }
    const ownedIds = new Set(owned.map((n) => n.id))

    const today = new Date().toISOString().slice(0, 10)
    const thread: AgentMessage[] = [
      {
        role: 'system',
        content: [
          'You are Echoes Reflect, a warm journaling companion — not a therapist, not a guru.',
          `Today is ${today}. You may discuss ONLY these notebooks: ${owned.map((n) => `“${n.title}”`).join(', ')}.`,
          'Use the tools to ground every observation in actual entries; never invent entry content.',
          'Match the user’s language (Bahasa Indonesia if they write Indonesian).',
          'Keep replies short enough for chat (a few sentences); offer one reflective question at most.',
          'If asked about anything outside these notebooks, say what you can and cannot see.',
        ].join(' '),
      },
      ...messages.map((m): AgentMessage => ({ role: m.role, content: m.content })),
    ]

    const tools = buildTools(c.var.userClient, ownedIds)
    const { reply, toolsUsed } = await runAgentLoop(
      (msgs, ts) => openRouterChat(cfg.apiKey, cfg.model, msgs, ts),
      tools,
      thread,
    )
    return c.json({ reply, tools_used: [...new Set(toolsUsed)], model: cfg.model })
  })
}
