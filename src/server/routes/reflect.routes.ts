import { createRoute, z } from '@hono/zod-openapi'
import type { SupabaseClient } from '@supabase/supabase-js'
import { UuidSchema } from '../schemas'
import { ApiError, Errors, fromPostgrestError } from '../errors'
import { requireAuth } from '../auth'
import { getAppUrl } from '../env'
import { bearerAuth, errorResponses, jsonBody, type App } from './helpers'
import { escapePostgrestValue } from './search.routes'
import { runAgentLoop, type AgentMessage, type ToolDef } from '../reflect/agent'
import { getCachedReflection, reflectCacheKey, setCachedReflection, type CacheContextEntry } from '../cache'

/**
 * Reflect — a journaling companion with a small tool loop.
 *
 * Stateless per request (no chat memory on the server): the client sends the
 * visible history, the agent may call read-only tools over the notebooks the
 * user explicitly selected — always their own, verified below — then answers.
 * Model + key come from the server environment so the key never reaches the
 * browser; supports any OpenAI-compatible or Anthropic-compatible endpoint.
 */

export interface AIConfig {
  apiKey: string
  entrypoint: string
  model: string
  isAnthropic: boolean
}

export function getAIConfig(): AIConfig | null {
  const apiKey =
    process.env.AI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENROUTER_API_KEY
  if (!apiKey) return null

  const rawEntrypoint =
    process.env.AI_ENTRYPOINT ||
    process.env.AI_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    (process.env.ANTHROPIC_API_KEY ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1')

  const isAnthropic =
    process.env.AI_PROVIDER === 'anthropic' ||
    rawEntrypoint.includes('anthropic.com') ||
    rawEntrypoint.endsWith('/messages') ||
    (!process.env.AI_API_KEY && !process.env.OPENAI_API_KEY && Boolean(process.env.ANTHROPIC_API_KEY))

  const defaultModel = isAnthropic ? 'claude-3-5-haiku-20241022' : 'gpt-4o-mini'
  const model =
    process.env.AI_MODEL ||
    process.env.OPENAI_MODEL ||
    process.env.ANTHROPIC_MODEL ||
    process.env.OPENROUTER_MODEL ||
    defaultModel

  return { apiKey, entrypoint: rawEntrypoint.trim(), model, isAnthropic }
}

function aiNotConfigured(): ApiError {
  return new ApiError(
    503,
    'AI_NOT_CONFIGURED',
    'The AI companion is not set up on this deployment yet — add AI_API_KEY to .env',
  )
}

const preview = (body: string, max = 160) => body.replace(/\s+/g, ' ').trim().slice(0, max)

/**
 * Sealed rows store ciphertext in `title`/`body`. Handing that to the model
 * as prose makes it quote base64 and hallucinate around it — an explicit
 * marker keeps the fallback honest when no decrypted bundle was shipped
 * (cold load before the corpus finished, or a vault with no device keys).
 */
const SEALED = '[sealed — this entry is end-to-end encrypted and its words are not readable here]'

/** Client-decrypted entry the agent may read (E2EE mode). */
export interface ContextEntry {
  id: string
  title: string
  body: string
  mood?: string | null
  tags?: string[]
  created_at?: string
}

export function buildTools(
  client: SupabaseClient,
  ownedIds: Set<string>,
  ctxByEntry?: Map<string, ContextEntry>,
): ToolDef[] {
  const guardNotebook = (id: unknown) => {
    if (typeof id !== 'string' || !ownedIds.has(id)) throw new Error('notebook not in scope')
    return id
  }
  const ctx = ctxByEntry ?? new Map<string, ContextEntry>()
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
        // E2EE: context entries are the only readable bodies — answer from
        // the bundle (the DB holds ciphertext that would mislead the agent).
        if (ctx.size > 0) {
          return [...ctx.values()].slice(0, limit).map((e) => ({
            id: e.id,
            title: e.title,
            mood: e.mood ?? null,
            tags: e.tags ?? [],
            created_at: e.created_at ?? null,
            preview: preview(e.body),
          }))
        }
        const { data, error } = await client
          .from('entries')
          .select('id, title, mood, tags, created_at, body, encrypted')
          .eq('notebook_id', notebook_id)
          .order('created_at', { ascending: false })
          .limit(limit)
        if (error) throw fromPostgrestError(error)
        return (
          (data ?? []) as Array<{ body: string; title: string; encrypted?: boolean } & Record<string, unknown>>
        ).map((e) => {
          const sealed = Boolean(e.encrypted)
          return {
            ...e,
            title: sealed ? SEALED : e.title,
            preview: sealed ? SEALED : preview(e.body),
            body: undefined,
          }
        })
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
        // E2EE: the decrypted bundle is the only source of bodies.
        const fromCtx = ctx.get(args.entry_id)
        if (ctx.size > 0) {
          if (!fromCtx) throw new Error('entry not in the decrypted context for this conversation')
          return fromCtx
        }
        const { data, error } = await client
          .from('entries')
          .select('id, notebook_id, title, body, mood, tags, created_at, encrypted')
          .eq('id', args.entry_id)
          .maybeSingle()
        if (error) throw fromPostgrestError(error)
        const row = data as { notebook_id: string; encrypted?: boolean } | null
        if (!row || !ownedIds.has(row.notebook_id)) throw new Error('entry not in scope')
        if (row.encrypted) return { ...data, title: SEALED, body: SEALED }
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
        // E2EE: search over the decrypted bundle.
        if (ctx.size > 0) {
          const q = args.q.trim().toLowerCase()
          return [...ctx.values()]
            .filter((e) => `${e.title}\n${e.body}`.toLowerCase().includes(q))
            .slice(0, limit)
            .map((e) => ({ id: e.id, title: e.title, created_at: e.created_at ?? null, preview: preview(e.body) }))
        }
        const like = escapePostgrestValue(`%${args.q.trim()}%`)
        const { data, error } = await client
          .from('entries')
          .select('id, notebook_id, title, created_at, body, encrypted, notebooks!inner(id)')
          .in('notebook_id', [...ownedIds])
          .or(`title.ilike.${like},body.ilike.${like}`)
          .order('created_at', { ascending: false })
          .limit(limit)
        if (error) throw fromPostgrestError(error)
        return (
          (data ?? []) as Array<
            { body: string; title: string; encrypted?: boolean; notebooks?: unknown } & Record<string, unknown>
          >
        ).map((e) => {
          const { notebooks: _j, body, ...rest } = e
          void _j
          const sealed = Boolean(e.encrypted)
          return { ...rest, title: sealed ? SEALED : rest.title, preview: sealed ? SEALED : preview(body) }
        })
      },
    },
    {
      name: 'mood_stats',
      description:
        'Count entries per mood across the selected notebooks, optionally since an ISO date. Counts say NOTHING about WHEN the entries were written — pair with list_entries when the question is about today or a recent period.',
      parameters: {
        type: 'object',
        properties: { since: { type: 'string', description: 'ISO date, e.g. 2026-08-01' } },
      },
      run: async (args) => {
        // E2EE: counts over the decrypted bundle (mood is plaintext metadata
        // in both modes, but timestamps live in the bundle for sealed rows).
        if (ctx.size > 0) {
          const since = typeof args.since === 'string' ? args.since : null
          const counts: Record<string, number> = {}
          let latest: string | null = null
          for (const e of ctx.values()) {
            if (since && e.created_at && e.created_at < since) continue
            const m = e.mood ?? 'none'
            counts[m] = (counts[m] ?? 0) + 1
            if (!latest || (e.created_at && e.created_at > latest)) latest = e.created_at ?? null
          }
          return { counts, latest_entry_at: latest }
        }
        let query = client
          .from('entries')
          .select('mood, created_at')
          .in('notebook_id', [...ownedIds])
        if (typeof args.since === 'string' && args.since) query = query.gte('created_at', args.since)
        const { data, error } = await query.limit(500)
        if (error) throw fromPostgrestError(error)
        const counts: Record<string, number> = {}
        let latest: string | null = null
        for (const row of (data ?? []) as Array<{ mood: string | null; created_at: string }>) {
          counts[row.mood ?? 'none'] = (counts[row.mood ?? 'none'] ?? 0) + 1
          if (!latest || row.created_at > latest) latest = row.created_at
        }
        return { counts, latest_entry_at: latest }
      },
    },
  ]
}

export async function providerChat(
  cfg: AIConfig,
  messages: AgentMessage[],
  tools: ToolDef[],
): Promise<{ content: string; toolCalls: Array<{ id: string; name: string; argsJson: string }> }> {
  if (cfg.isAnthropic) {
    return anthropicChat(cfg, messages, tools)
  }
  return openAIChat(cfg, messages, tools)
}

/** Free-tier models can think for well over a minute; surface aborts as a 504, not a bare DOMException. */
async function chatFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(120_000) })
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new ApiError(
        504,
        'AI_TIMEOUT',
        'The model provider did not answer in time — free-tier models get slow under load. Try again, or set a faster AI_MODEL.',
      )
    }
    throw err
  }
}

async function openAIChat(
  cfg: AIConfig,
  messages: AgentMessage[],
  tools: ToolDef[],
): Promise<{ content: string; toolCalls: Array<{ id: string; name: string; argsJson: string }> }> {
  const url = cfg.entrypoint.endsWith('/chat/completions')
    ? cfg.entrypoint
    : `${cfg.entrypoint.replace(/\/+$/, '')}/chat/completions`

  const res = await chatFetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${cfg.apiKey}`,
      'content-type': 'application/json',
      'HTTP-Referer': getAppUrl(),
      'X-Title': 'Echoes Reflect',
    },
    body: JSON.stringify({
      model: cfg.model,
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
  })
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw aiNotConfigured()
    if (res.status === 429) {
      throw new ApiError(
        429,
        'AI_RATE_LIMITED',
        'The model provider is rate-limited right now — wait a minute and retry.',
      )
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

async function anthropicChat(
  cfg: AIConfig,
  messages: AgentMessage[],
  tools: ToolDef[],
): Promise<{ content: string; toolCalls: Array<{ id: string; name: string; argsJson: string }> }> {
  const url = cfg.entrypoint.endsWith('/messages') ? cfg.entrypoint : `${cfg.entrypoint.replace(/\/+$/, '')}/messages`

  const system = messages.find((m) => m.role === 'system')?.content

  const anthropicMessages: Array<{ role: 'user' | 'assistant'; content: unknown }> = []

  for (const m of messages) {
    if (m.role === 'system') continue
    if (m.role === 'tool') {
      anthropicMessages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: m.toolCallId,
            content: m.content,
          },
        ],
      })
    } else if (m.role === 'assistant' && m.toolCalls?.length) {
      const parts: unknown[] = []
      if (m.content) parts.push({ type: 'text', text: m.content })
      for (const t of m.toolCalls) {
        let input: unknown = {}
        try {
          input = JSON.parse(t.argsJson || '{}')
        } catch {
          input = {}
        }
        parts.push({ type: 'tool_use', id: t.id, name: t.name, input })
      }
      anthropicMessages.push({ role: 'assistant', content: parts })
    } else {
      anthropicMessages.push({ role: m.role, content: m.content })
    }
  }

  const res = await chatFetch(url, {
    method: 'POST',
    headers: {
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 4096,
      ...(system ? { system } : {}),
      messages: anthropicMessages,
      ...(tools.length > 0
        ? {
            tools: tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.parameters,
            })),
          }
        : {}),
    }),
  })

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw aiNotConfigured()
    if (res.status === 429) {
      throw new ApiError(
        429,
        'AI_RATE_LIMITED',
        'The model provider is rate-limited right now — wait a minute and retry.',
      )
    }
    const text = await res.text().catch(() => '')
    throw new ApiError(502, 'AI_UPSTREAM', `The model provider failed (${res.status}): ${text.slice(0, 200)}`)
  }

  const body = (await res.json()) as {
    content?: Array<{
      type: string
      text?: string
      id?: string
      name?: string
      input?: unknown
    }>
  }

  let textContent = ''
  const toolCalls: Array<{ id: string; name: string; argsJson: string }> = []
  for (const block of body.content ?? []) {
    if (block.type === 'text' && block.text) textContent += block.text
    if (block.type === 'tool_use' && block.id && block.name) {
      toolCalls.push({
        id: block.id,
        name: block.name,
        argsJson: JSON.stringify(block.input ?? {}),
      })
    }
  }

  return { content: textContent, toolCalls }
}

const ChatBody = z
  .object({
    notebook_ids: z.array(UuidSchema).min(1).max(10),
    messages: z
      .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(2000) }))
      .min(1)
      .max(20),
    /** Client-decrypted entries (E2EE) the agent may read this turn. */
    context: z
      .array(
        z
          .object({
            id: UuidSchema,
            title: z.string().min(1).max(200),
            body: z.string().max(20_000),
            mood: z.string().max(10).nullable().optional(),
            tags: z.array(z.string().max(40)).max(20).optional(),
            created_at: z.string().max(40).optional(),
          })
          .strict(),
      )
      .max(40)
      .optional(),
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
            schema: z.object({
              reply: z.string(),
              tools_used: z.array(z.string()),
              model: z.string(),
              cached: z
                .boolean()
                .default(false)
                .openapi({ description: 'True when the reply was served from cache without a model call' }),
            }),
          },
        },
      },
    },
  })

  app.openapi(chat, async (c) => {
    const cfg = getAIConfig()
    if (!cfg) throw aiNotConfigured()
    const { notebook_ids, messages, context } = c.req.valid('json')
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

    // E2EE mode: the client sends decrypted entries for the ticked
    // notebooks. Verify each id really lives in a ticked notebook (metadata
    // check only — the server never reads the body), then let the agent
    // tools answer from the bundle instead of the database, so the agent
    // reads plaintext the server itself can no longer produce.
    const ctxByEntry = new Map<string, ContextEntry>()
    if (context && context.length > 0) {
      const ids = context.map((e) => e.id)
      const { data: rows, error: ctxErr } = await c.var.userClient
        .from('entries')
        .select('id, notebook_id, encrypted')
        .in('id', ids)
      if (ctxErr) throw fromPostgrestError(ctxErr)
      const valid = new Set(
        ((rows ?? []) as Array<{ id: string; notebook_id: string }>)
          .filter((r) => ownedIds.has(r.notebook_id))
          .map((r) => r.id),
      )
      for (const e of context) if (valid.has(e.id)) ctxByEntry.set(e.id, e)
    }

    // Cache lookup happens after the scope checks so a cached reply is only
    // ever served to a caller who proved they own these notebooks.
    const cacheKey = reflectCacheKey(me, notebook_ids, messages, context)
    const cached = await getCachedReflection(me, cacheKey)
    if (cached) {
      return c.json({
        reply: cached.reply,
        tools_used: [...new Set(cached.toolsUsed)],
        model: cached.model,
        cached: true,
      })
    }

    const today = new Date().toISOString().slice(0, 10)
    const thread: AgentMessage[] = [
      {
        role: 'system',
        content: [
          'You are Echoes Reflect, a warm journaling companion — not a therapist, not a guru.',
          `Today is ${today}. You may discuss ONLY these notebooks: ${owned
            .map((n) => `“${n.title}” (notebook_id for tools: ${n.id})`)
            .join(
              '; ',
            )}. Use the id only inside tool arguments — never show ids or other internal identifiers to the user.`,
          'Use the tools to ground every observation in actual entries; never invent entry content.',
          'Always reply in the language of the user’s LATEST message, even if earlier turns or the entry contents are in another language.',
          'Keep replies short enough for chat (a few sentences); offer one reflective question at most.',
          'If asked about anything outside these notebooks, say what you can and cannot see.',
        ].join(' '),
      },
      ...messages.map((m): AgentMessage => ({ role: m.role, content: m.content })),
    ]

    const tools = buildTools(c.var.userClient, ownedIds, ctxByEntry)
    const { reply, toolsUsed } = await runAgentLoop((msgs, ts) => providerChat(cfg, msgs, ts), tools, thread)

    // Best-effort: a failed write only costs the next request a model call.
    void setCachedReflection(me, cacheKey, { reply, toolsUsed, model: cfg.model })

    return c.json({ reply, tools_used: [...new Set(toolsUsed)], model: cfg.model, cached: false })
  })
}
