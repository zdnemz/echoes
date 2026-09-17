/**
 * Reflect reply cache.
 *
 * A reflection is worth recomputing only when what produced it changed. The
 * model loop costs up to five provider calls per request, so a hit turns a
 * multi-second, billed request into one Postgres/Redis lookup.
 *
 * Keys are sha256 over the user plus everything that shapes the reply —
 * notebook scope, message thread, and the decrypted entry context the client
 * shipped. The server therefore stores only the model's reply, never journal
 * plaintext, and two users with identical threads cannot read each other's
 * rows (the user_id is in the hash and in the row).
 *
 * Backend precedence: Redis when REDIS_URL is set (it is what Redis is for),
 * otherwise Postgres when the service role is available (the store the
 * deployment already has — see migration 0016), otherwise a per-process Map.
 * Every read/write degrades to "miss" or "no-op" on any store error: a cache
 * that can take the API down is worse than no cache.
 */

import { createHash } from 'node:crypto'
import { hasServiceRole } from './env'
import { getServiceClient } from './supabase'

export interface CacheMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface CacheContextEntry {
  id: string
  title: string
  body: string
  mood?: string | null
  tags?: string[]
  created_at?: string
}

export interface CachedReflection {
  reply: string
  toolsUsed: string[]
  model: string
}

/** Bump when the system prompt or tool set changes enough to stale old replies. */
const KEY_VERSION = 'v1'

/** How long a cached reply is served before the model is consulted again. */
function ttlHours(): number {
  const raw = Number.parseFloat(process.env.REFLECT_CACHE_TTL_HOURS ?? '')
  return Number.isFinite(raw) && raw > 0 ? raw : 168 // 7 days
}

/**
 * Stable digest of everything that influences a reflection. Order-independent
 * (notebook ids, entries and tags are sorted) so equivalent requests collide
 * regardless of how the client assembled them.
 */
export function reflectCacheKey(
  userId: string,
  notebookIds: string[],
  messages: CacheMessage[],
  context?: CacheContextEntry[],
): string {
  const sortedContext = (context ?? [])
    .map((e) => ({
      id: e.id,
      title: e.title,
      body: e.body,
      mood: e.mood ?? null,
      tags: [...(e.tags ?? [])].sort(),
      created_at: e.created_at ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))

  const canonical = JSON.stringify({
    v: KEY_VERSION,
    user: userId,
    notebooks: [...notebookIds].sort(),
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    context: sortedContext,
  })

  return createHash('sha256').update(canonical).digest('hex')
}

// ----------------------------------------------------------------- backends

type Backend = 'redis' | 'postgres' | 'memory'

let resolved: Backend | null = null
let redisClient: import('ioredis').default | null = null
/** Redis client, created once and only when REDIS_URL is configured. */
async function getRedis() {
  if (!process.env.REDIS_URL) return null
  if (!redisClient) {
    // Dynamic import: Redis-less deployments and tests never load the driver.
    const { default: Redis } = await import('ioredis')
    redisClient = new Redis(process.env.REDIS_URL, {
      // Serverless/bun: don't hold a crowd of idle sockets per instance.
      maxRetriesPerRequest: 2,
      enableReadyCheck: false,
    })
    redisClient.on('error', () => {
      // Surfaced as a miss by the caller's catch; nothing to recover here.
    })
  }
  return redisClient
}

function backend(): Backend {
  if (!resolved) {
    if (process.env.REDIS_URL) resolved = 'redis'
    else if (hasServiceRole()) resolved = 'postgres'
    else resolved = 'memory'
  }
  return resolved
}

// In-memory store for the no-config path (local dev, tests).
const memory = new Map<string, { value: string; expiresAt: number }>()

function memoryKey(userId: string, key: string): string {
  return `${userId}:${key}`
}

async function redisGet(userId: string, key: string): Promise<CachedReflection | null> {
  const client = await getRedis()
  if (!client) return null
  const raw = await client.get(`reflect:${userId}:${key}`)
  return raw ? (JSON.parse(raw) as CachedReflection) : null
}

async function redisSet(userId: string, key: string, value: CachedReflection): Promise<void> {
  const client = await getRedis()
  if (!client) return
  await client.set(`reflect:${userId}:${key}`, JSON.stringify(value), 'EX', Math.round(ttlHours() * 3600))
}

async function pgGet(userId: string, key: string): Promise<CachedReflection | null> {
  const service = getServiceClient()
  if (!service) return null
  const expiresBefore = new Date(Date.now() - ttlHours() * 3_600_000).toISOString()
  const { data, error } = await service
    .from('reflect_cache')
    .select('reply, tools_used, model')
    .eq('user_id', userId)
    .eq('key', key)
    .gt('created_at', expiresBefore)
    .maybeSingle()
  if (error || !data) return null
  const row = data as { reply: string; tools_used: unknown; model: string }
  const toolsUsed = Array.isArray(row.tools_used) ? (row.tools_used as string[]) : []
  return { reply: row.reply, toolsUsed, model: row.model }
}

async function pgSet(userId: string, key: string, value: CachedReflection): Promise<void> {
  const service = getServiceClient()
  if (!service) return
  await service
    .from('reflect_cache')
    .upsert(
      { user_id: userId, key, reply: value.reply, tools_used: value.toolsUsed, model: value.model },
      { onConflict: 'user_id,key' },
    )
}

// ----------------------------------------------------------------- public api

/** Serve a cached reflection, or null when there is no usable one. */
export async function getCachedReflection(userId: string, key: string): Promise<CachedReflection | null> {
  try {
    switch (backend()) {
      case 'redis':
        return await redisGet(userId, key)
      case 'postgres':
        return await pgGet(userId, key)
      default: {
        const hit = memory.get(memoryKey(userId, key))
        if (!hit || hit.expiresAt <= Date.now()) return null
        return JSON.parse(hit.value) as CachedReflection
      }
    }
  } catch {
    // A miss is always safe — the caller recomputes.
    return null
  }
}

/** Store a fresh reflection. Best-effort: never fails the request. */
export async function setCachedReflection(userId: string, key: string, value: CachedReflection): Promise<void> {
  try {
    switch (backend()) {
      case 'redis':
        await redisSet(userId, key, value)
        break
      case 'postgres':
        await pgSet(userId, key, value)
        break
      default:
        memory.set(memoryKey(userId, key), {
          value: JSON.stringify(value),
          expiresAt: Date.now() + ttlHours() * 3_600_000,
        })
    }
  } catch {
    // Write failure only costs the next request a model call.
  }
}

/** Which store is in use — surfaced by /health. */
export function reflectCacheBackend(): Backend {
  return backend()
}
