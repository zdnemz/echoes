'use client'

/**
 * Reflect — a chat thread with the journaling companion.
 *
 * The user explicitly ticks which of their own notebooks the agent may read
 * (nothing is in scope by default); history lives in component state and each
 * send posts the visible tail to POST /reflect/chat. No streaming yet — one
 * round trip per reply keeps this a single small component.
 */

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CircleNotch, PaperPlaneTilt, Sparkle } from '@phosphor-icons/react/dist/ssr'
import { Button } from '@/components/ui/button'
import { useNotebooks } from '@/lib/api/hooks'
import { useSession } from '@/lib/auth/session'
import { reflectChat, type ReflectMessage } from '@/lib/api/endpoints'
import { ApiError } from '@/lib/api/client'
import { useSearchCorpus } from '@/lib/crypto/local-search'

interface Turn extends ReflectMessage {
  tools?: string[]
}

// Chat history survives reloads — keyed by the exact set of notebooks in
// scope, so re-ticking changes the conversation, not the storage.
const historyKey = (ids: string[]) => `reflect:chat:${[...ids].sort().join(',')}`
const HISTORY_CAP = 60

export function ReflectView() {
  const { user } = useSession()
  const notebooks = useNotebooks()
  const corpus = useSearchCorpus()
  const mine = (notebooks.data?.data ?? []).filter((nb) => nb.owner_id === user?.id)
  const [selected, setSelected] = useState<string[]>([])
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [turns.length, busy])

  // Swap the thread when the scope changes; persist each new state.
  const scopeKey = historyKey(selected)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(scopeKey)
      setTurns(raw ? (JSON.parse(raw) as Turn[]) : [])
    } catch {
      setTurns([])
    }
  }, [scopeKey])

  useEffect(() => {
    if (selected.length === 0) return
    try {
      window.localStorage.setItem(scopeKey, JSON.stringify(turns.slice(-HISTORY_CAP)))
    } catch {
      // storage full/blocked — the in-memory thread still works
    }
  }, [turns, scopeKey, selected.length])

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || busy || selected.length === 0) return
    setBusy(true)
    setNotice(null)
    const next = [...turns, { role: 'user', content: text } as Turn]
    setTurns(next)
    setInput('')
    try {
      // E2EE: with the vault open, decrypt the ticked notebooks' entries
      // here and ship them as the agent's readable context — the server
      // holds only ciphertext and can no longer read bodies itself.
      let context:
        | Array<{ id: string; title: string; body: string; mood: string | null; tags: string[]; created_at: string }>
        | undefined
      if (corpus.items) {
        context = corpus.items
          .filter((i) => selected.includes(i.entry.notebook_id))
          .slice(0, 40)
          .map((i) => ({
            id: i.entry.id,
            title: i.title.slice(0, 200),
            body: i.body.slice(0, 20_000),
            mood: i.entry.mood ?? null,
            tags: i.entry.tags ?? [],
            created_at: i.entry.created_at,
          }))
      }
      const res = await reflectChat({ notebook_ids: selected, messages: next.slice(-20), context })
      setTurns([...next, { role: 'assistant', content: res.reply, tools: res.tools_used }])
    } catch (err) {
      setTurns(next)
      setInput(text)
      if (err instanceof ApiError && err.code === 'AI_NOT_CONFIGURED') {
        setNotice('The companion is not set up on this deployment yet — add AI_API_KEY to .env.')
      } else if (err instanceof ApiError && err.code === 'AI_RATE_LIMITED') {
        toast.error('The model provider is rate-limited — wait a minute and retry.')
      } else if (err instanceof ApiError && err.code === 'AI_TIMEOUT') {
        toast.error('The model was too slow to answer — free-tier models get sluggish under load. Try sending again.')
      } else {
        toast.error(err instanceof Error ? err.message : "Couldn't reach the companion.")
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-2xl flex-col px-4 lg:px-0">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-clay">reflect</p>
      <h1 className="font-display mt-2 text-3xl leading-tight tracking-tight text-ink">A companion, not an archive</h1>
      <p className="mt-2 max-w-[60ch] text-[13px] leading-relaxed text-ink-soft">
        Tick the notebooks it may read — nothing else is in scope — then ask what your own words add up to.
      </p>

      {/* scope picker */}
      <div className="mt-5 rounded-xl border border-line bg-paper-raised p-3.5">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint">
            May read · {selected.length}/{mine.length}
          </p>
          {turns.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setTurns([])
                try {
                  window.localStorage.removeItem(scopeKey)
                } catch {
                  // nothing stored
                }
              }}
              className="press font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint hover:text-ink"
            >
              clear chat
            </button>
          )}
        </div>
        {notebooks.isLoading ? (
          <div className="skeleton-line mt-2 h-9 w-full" />
        ) : mine.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-ink-faint">No notebooks of your own yet — write one first.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {mine.map((nb) => {
              const on = selected.includes(nb.id)
              return (
                <li key={nb.id}>
                  <button
                    type="button"
                    onClick={() => toggle(nb.id)}
                    aria-pressed={on}
                    className={`press rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors ${
                      on ? 'bg-ink text-paper' : 'border border-line text-ink-soft hover:border-line-strong'
                    }`}
                  >
                    {nb.title}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {notice && (
        <p className="mt-4 rounded-lg border border-line bg-paper-raised px-4 py-3 text-[12.5px] text-ink-soft">
          {notice}
        </p>
      )}

      {/* thread */}
      <ul className="mt-6 flex-1 space-y-4" aria-label="Conversation" aria-live="polite">
        {turns.length === 0 && (
          <li className="rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
            <Sparkle weight="light" className="mx-auto h-6 w-6 text-ink-ghost" />
            <p className="font-display mt-3 text-lg text-ink">Start with a week, a mood, a question</p>
            <p className="mx-auto mt-1.5 max-w-[44ch] text-[12.5px] text-ink-faint">
              “What kept coming up this month?” — “How did my sleep entries sound?” The companion reads what you ticked
              above, nothing more.
            </p>
          </li>
        )}
        {turns.map((t, i) => {
          const mineMsg = t.role === 'user'
          return (
            <li key={i} className={`flex ${mineMsg ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] px-3.5 py-2.5 sm:max-w-[80%] ${
                  mineMsg
                    ? 'rounded-2xl rounded-br-md bg-ink text-paper'
                    : 'rounded-2xl rounded-bl-md border border-line bg-paper-raised text-ink'
                }`}
              >
                <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed">{t.content}</p>
                {t.tools && t.tools.length > 0 && (
                  <p className="mt-1.5 font-mono text-[10px] text-ink-faint">checked: {t.tools.join(', ')}</p>
                )}
              </div>
            </li>
          )
        })}
        {busy && (
          <li className="flex justify-start">
            <p className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-line bg-paper-raised px-3.5 py-2.5 text-[13px] text-ink-faint">
              <CircleNotch weight="bold" className="h-3.5 w-3.5 animate-spin text-clay" />
              Reading what you ticked…
            </p>
          </li>
        )}
      </ul>
      <div ref={endRef} />

      {/* composer */}
      <form onSubmit={send} className="sticky bottom-0 mt-4 flex items-end gap-2 bg-paper py-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            selected.length === 0 ? 'Tick a notebook above first…' : 'Ask about your entries… (Enter to send)'
          }
          aria-label="Ask the companion"
          disabled={selected.length === 0}
          className="h-11 flex-1 rounded-xl border border-line bg-paper-raised px-3.5 text-[13.5px] text-ink placeholder:text-ink-faint focus:border-clay-soft focus:outline-none focus:ring-2 focus:ring-clay-soft/40 disabled:opacity-60"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) void send(e as unknown as React.FormEvent)
          }}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!input.trim() || busy || selected.length === 0}
          className="press h-11 w-11 shrink-0 rounded-xl shadow-ink"
          aria-label="Send"
        >
          <PaperPlaneTilt weight="fill" className="h-4 w-4" />
        </Button>
      </form>
    </div>
  )
}
