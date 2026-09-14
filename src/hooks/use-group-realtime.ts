'use client'

/**
 * Group realtime over the SSE stream (GET /api/groups/:id/stream).
 *
 * fetch + manual SSE parsing instead of EventSource: EventSource cannot send
 * the Authorization header, and a token-in-URL would leak into server logs.
 * On `entries` events the group journal cache is invalidated, so new
 * messages render in ~2s without polling full pages from every tab.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getToken } from '@/lib/api/client'
import { sendSeen as postSeen, sendTyping as postTyping } from '@/lib/api/endpoints'

export interface TypingPeer {
  user_id: string
  name: string
}

export interface SeenPeer {
  user_id: string
  entry_id: string
  at: number
}

export type StreamStatus = 'live' | 'connecting' | 'offline'

export function useGroupRealtime(groupId: string | null) {
  const qc = useQueryClient()
  const [status, setStatus] = useState<StreamStatus>('connecting')
  const [typing, setTyping] = useState<TypingPeer[]>([])
  const [seen, setSeen] = useState<SeenPeer[]>([])
  const lastTypingSent = useRef(0)

  useEffect(() => {
    if (!groupId) {
      setStatus('offline')
      return
    }
    let stopped = false
    let backoff = 1000
    const controller = new AbortController()

    const connect = async () => {
      const token = getToken()
      if (!token) {
        setStatus('offline')
        return
      }
      setStatus((s) => (s === 'live' ? s : 'connecting'))
      try {
        const res = await fetch(`/api/groups/${groupId}/stream`, {
          headers: { authorization: `Bearer ${token}`, accept: 'text/event-stream' },
          signal: controller.signal,
        })
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`)
        backoff = 1000
        const reader = res.body.getReader()
        const dec = new TextDecoder()
        let buf = ''
        for (;;) {
          const { done, value } = await reader.read()
          if (done || stopped) break
          buf += dec.decode(value, { stream: true })
          let idx: number
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, idx)
            buf = buf.slice(idx + 2)
            let event = 'message'
            let data = ''
            for (const line of chunk.split('\n')) {
              if (line.startsWith('event:')) event = line.slice(6).trim()
              else if (line.startsWith('data:')) data += line.slice(5).trim()
            }
            if (stopped) break
            if (event === 'hello') setStatus('live')
            else if (event === 'entries') {
              setStatus('live')
              void qc.invalidateQueries({ queryKey: ['group-entries', groupId] })
              // The journal version also covers read receipts (entry_views),
              // so a new view re-ticks the stream — refresh the ticks too.
              void qc.invalidateQueries({ queryKey: ['group-views', groupId] })
            } else if (event === 'members') {
              setStatus('live')
              void qc.invalidateQueries({ queryKey: ['group', groupId] })
              void qc.invalidateQueries({ queryKey: ['group-members', groupId] })
              void qc.invalidateQueries({ queryKey: ['groups'] })
              void qc.invalidateQueries({ queryKey: ['join-requests', groupId] })
            } else if (event === 'presence') {
              try {
                const p = JSON.parse(data) as { typing: TypingPeer[]; seen: SeenPeer[] }
                setTyping(p.typing ?? [])
                setSeen(p.seen ?? [])
              } catch {
                // malformed presence frame — the next tick repairs it
              }
            } else if (event === 'retry-now') {
              try {
                await reader.cancel()
              } catch {
                // already torn down
              }
              break
            }
          }
        }
      } catch {
        if (!stopped) setStatus('connecting')
      }
      if (!stopped) {
        // Reconnect with capped backoff; the journal's 15s poll covers gaps.
        await new Promise((r) => setTimeout(r, backoff))
        backoff = Math.min(backoff * 2, 15000)
        void connect()
      }
    }

    void connect()
    return () => {
      stopped = true
      controller.abort()
    }
  }, [groupId, qc])

  /** Throttled "I'm typing" ping (4s) — the server TTL expires it for us. */
  const sendTyping = useCallback(
    (name: string) => {
      if (!groupId || Date.now() - lastTypingSent.current < 4000) return
      lastTypingSent.current = Date.now()
      void postTyping(groupId, { typing: true, name }).catch(() => {})
    },
    [groupId],
  )

  const sendSeen = useCallback(
    (entryId: string) => {
      if (!groupId) return
      void postSeen(groupId, entryId).catch(() => {})
    },
    [groupId],
  )

  return { status, typing, seen, sendTyping, sendSeen }
}
