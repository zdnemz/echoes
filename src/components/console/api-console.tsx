'use client'

/**
 * Journaling API — developer console (moved from `/` to `/console`).
 *
 * Serves as the ops landing for the backend deployment:
 *  - live health of the API and Supabase
 *  - the full endpoint catalog, rendered from the live OpenAPI document
 *  - an auth sandbox (paste a bearer token, call /api/auth/me)
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Pulse,
  ArrowClockwise,
  ArrowSquareOut,
  BookOpen,
  CaretRight,
  CheckCircle,
  Database,
  FileCode,
  Lightning,
  PaperPlaneTilt,
  ShieldCheck,
  Users,
  XCircle,
} from '@phosphor-icons/react/dist/ssr'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// ---------------------------------------------------------------- types

interface HealthPayload {
  status: 'ok' | 'degraded'
  time: string
  supabase: {
    configured: boolean
    service_role: boolean
    reachable: boolean | null
    schema_ready: boolean | null
  }
  version: string
}

interface OperationInfo {
  summary?: string
  tags?: string[]
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-background text-foreground border-2 border-foreground font-black',
  POST: 'bg-foreground text-background border-2 border-foreground font-black',
  PATCH: 'bg-muted text-foreground border-2 border-foreground font-black',
  PUT: 'bg-muted text-foreground border-2 border-foreground font-black',
  DELETE: 'bg-accent text-background border-2 border-foreground font-black',
}

const TAG_META: Record<string, { label: string; icon: typeof ShieldCheck }> = {
  Auth: { label: 'Authentication', icon: ShieldCheck },
  Notebooks: { label: 'Notebooks', icon: BookOpen },
  Entries: { label: 'Entries', icon: FileCode },
  Search: { label: 'Search', icon: Lightning },
  Groups: { label: 'Groups', icon: Users },
  Invites: { label: 'Invites', icon: PaperPlaneTilt },
  System: { label: 'System', icon: Pulse },
}

// ---------------------------------------------------------------- component

export function ApiConsole() {
  const [health, setHealth] = useState<HealthPayload | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)

  // Endpoint catalog from the live OpenAPI document
  const [catalog, setCatalog] = useState<Record<string, OperationInfo> | null>(null)

  // Auth sandbox
  const [token, setToken] = useState('')
  const [authResult, setAuthResult] = useState<{ ok: boolean; body: unknown } | null>(null)
  const [authLoading, setAuthLoading] = useState(false)

  // ---- health polling (every 5s)
  const refreshHealth = useCallback(async () => {
    setHealthLoading(true)
    try {
      const res = await fetch('/api/health')
      setHealth(await res.json())
    } catch {
      setHealth(null)
    } finally {
      setHealthLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshHealth()
    const timer = setInterval(refreshHealth, 5000)
    return () => clearInterval(timer)
  }, [refreshHealth])

  // ---- OpenAPI catalog
  useEffect(() => {
    fetch('/api/doc')
      .then((res) => res.json())
      .then((doc: { paths?: Record<string, OperationInfo> }) => setCatalog(doc.paths ?? {}))
      .catch(() => setCatalog(null))
  }, [])

  // The doc structure is paths -> path -> method -> operation. Flatten:
  const endpoints = useMemo(() => {
    if (!catalog) return [] as Array<{ tag: string; method: string; path: string; summary?: string }>
    const list: Array<{ tag: string; method: string; path: string; summary?: string }> = []
    for (const [path, perMethod] of Object.entries(
      catalog as unknown as Record<string, Record<string, OperationInfo>>,
    )) {
      for (const [method, op] of Object.entries(perMethod)) {
        list.push({ tag: op.tags?.[0] ?? 'Other', method: method.toUpperCase(), path, summary: op.summary })
      }
    }
    return list.sort((a, b) => (a.tag + a.path).localeCompare(b.tag + b.path))
  }, [catalog])

  const tags = useMemo(() => {
    const map = new Map<string, typeof endpoints>()
    for (const ep of endpoints) {
      if (!map.has(ep.tag)) map.set(ep.tag, [])
      map.get(ep.tag)!.push(ep)
    }
    return Array.from(map.entries())
  }, [endpoints])

  // ---- auth sandbox
  const checkToken = async () => {
    if (!token.trim()) {
      setAuthResult({ ok: false, body: { error: { message: 'Paste an access token first (POST /api/auth/login)' } } })
      return
    }
    setAuthLoading(true)
    try {
      const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token.trim()}` } })
      setAuthResult({ ok: res.ok, body: await res.json() })
    } catch (e) {
      setAuthResult({ ok: false, body: { error: { message: String(e) } } })
    } finally {
      setAuthLoading(false)
    }
  }

  // ---- render helpers
  const supa = health?.supabase
  const statusTone = (ok: boolean | null | undefined) =>
    ok === true ? 'text-emerald-600' : ok === false ? 'text-red-500' : 'text-amber-500'

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* ------------------------------------------------ header */}
      <header className="sticky top-0 z-10 border-b-[3px] border-foreground bg-background">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-foreground bg-accent text-background"
              aria-hidden
            >
              <BookOpen className="h-5 w-5" weight="bold" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display truncate text-lg uppercase leading-tight">
                Journaling API · Developer Console
              </h1>
              <p className="truncate text-xs font-bold">Hono + Zod + OpenAPI 3.1 · Supabase Postgres/Auth/RLS</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge
              variant={health?.status === 'ok' ? 'default' : 'secondary'}
              className={health?.status === 'ok' ? 'bg-accent text-background' : 'bg-muted'}
            >
              {healthLoading && !health ? 'checking…' : health ? `api ${health.status}` : 'api unreachable'}
            </Badge>
            <Button asChild size="sm" variant="outline">
              <a href="/">Echoes app</a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href="/api/docs" target="_blank" rel="noreferrer">
                <ArrowSquareOut className="mr-1 h-3.5 w-3.5" /> Scalar docs
              </a>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <a href="/api/doc" target="_blank" rel="noreferrer">
                <FileCode className="mr-1 h-3.5 w-3.5" /> openapi.json
              </a>
            </Button>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------ main */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* status cards */}
        <section aria-label="System status" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Pulse className="h-3.5 w-3.5" /> API server
              </CardDescription>
              <CardTitle className="text-base flex items-center gap-2">
                {health?.status === 'ok' ? (
                  <CheckCircle className="h-4 w-4 text-sage" />
                ) : (
                  <XCircle className={`h-4 w-4 ${health ? 'text-amber-500' : 'text-red-500'}`} />
                )}
                {health ? health.status : 'unreachable'}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Hono on Next.js · {health ? `v${health.version}` : '—'}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5" /> Supabase
              </CardDescription>
              <CardTitle className={`text-base flex items-center gap-2 ${statusTone(supa?.configured)}`}>
                {supa?.configured ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {supa?.configured ? 'configured' : 'not configured'}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs space-y-0.5">
              <p className={statusTone(supa?.reachable)}>
                REST reachable: {supa?.reachable === null ? '—' : String(supa?.reachable)}
              </p>
              <p className={statusTone(supa?.schema_ready)}>
                schema (migrations): {supa?.schema_ready === null ? '—' : String(supa?.schema_ready)}
              </p>
              <p className={statusTone(supa?.service_role)}>service role: {String(supa?.service_role ?? false)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5">
                <Lightning className="h-3.5 w-3.5" /> API surface
              </CardDescription>
              <CardTitle className="text-base">{endpoints.length} operations</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Validated by Zod · documented via OpenAPI 3.1 · RLS enforced in Postgres
            </CardContent>
          </Card>
        </section>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
          {/* ---------------------------------------------- endpoint catalog */}
          <section aria-label="Endpoint catalog" className="lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Endpoints</CardTitle>
                <CardDescription>
                  Rendered live from <code className="text-xs">GET /api/doc</code> — full interactive reference at{' '}
                  <a className="underline text-clay-ink" href="/api/docs" target="_blank" rel="noreferrer">
                    /api/docs
                  </a>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {tags.length === 0 && <p className="text-sm text-muted-foreground">Loading catalog…</p>}
                {tags.map(([tag, items]) => {
                  const meta = TAG_META[tag] ?? { label: tag, icon: CaretRight }
                  const Icon = meta.icon
                  return (
                    <div key={tag}>
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="h-4 w-4 text-clay-ink" aria-hidden />
                        <h2 className="text-sm font-semibold">{meta.label}</h2>
                        <Badge variant="outline" className="text-[10px]">
                          {items.length}
                        </Badge>
                      </div>
                      <ul className="space-y-1.5">
                        {items.map((ep) => (
                          <li key={`${ep.method}-${ep.path}`} className="flex items-start gap-2 text-sm">
                            <span
                              className={`inline-flex w-16 shrink-0 justify-center rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${METHOD_COLORS[ep.method] ?? 'bg-paper-deep text-ink-soft border-line'}`}
                            >
                              {ep.method}
                            </span>
                            <span className="font-mono text-xs leading-5 break-all">{ep.path}</span>
                            <span className="hidden xl:inline text-xs text-muted-foreground truncate ml-auto max-w-[16rem]">
                              {ep.summary}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </section>

          {/* ---------------------------------------------- playground */}
          <section aria-label="Playground" className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Playground</CardTitle>
                <CardDescription>Paste a bearer token to verify it against the API.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    <Label htmlFor="token" className="text-xs">
                      Bearer token (from POST /api/auth/login)
                    </Label>
                    <Input
                      id="token"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="eyJhbGciOi…"
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                  <Button onClick={checkToken} size="sm" disabled={authLoading} className="gap-1.5">
                    {authLoading ? (
                      <ArrowClockwise className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    )}
                    Call GET /api/auth/me
                  </Button>
                  {authResult && (
                    <pre
                      className={`text-[11px] font-mono rounded border p-2 max-h-48 overflow-auto ${authResult.ok ? 'bg-sage-tint/60 border-sage/30' : 'bg-ember-tint/50 border-ember/30'}`}
                    >
                      {JSON.stringify(authResult.body, null, 2)}
                    </pre>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* getting started card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Getting started</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-2 text-muted-foreground">
                <p>
                  <span className="font-semibold text-foreground">1.</span> Apply the SQL migration{' '}
                  <code>supabase/migrations/0001_init.sql</code> to your Supabase project.
                </p>
                <p>
                  <span className="font-semibold text-foreground">2.</span> Set <code>SUPABASE_URL</code>,{' '}
                  <code>SUPABASE_ANON_KEY</code>, <code>SUPABASE_SERVICE_ROLE_KEY</code> in <code>.env</code>.
                </p>
                <p>
                  <span className="font-semibold text-foreground">3.</span> Sign up via{' '}
                  <code>POST /api/auth/signup</code> (or the form on the{' '}
                  <a className="underline text-clay-ink" href="/login">
                    product page
                  </a>
                  ).
                </p>
                <p>
                  <span className="font-semibold text-foreground">4.</span> Paste the returned <code>access_token</code>{' '}
                  above — every user-scoped call uses it as the bearer token.
                </p>
              </CardContent>
            </Card>
          </section>
        </div>
      </main>

      {/* ------------------------------------------------ footer (sticky) */}
      <footer className="mt-auto border-t-[3px] border-foreground bg-background">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-4 sm:px-6 lg:px-8 text-xs font-bold">
          <span>
            Journaling API · OpenAPI 3.1 · Scalar reference at{' '}
            <a
              className="underline decoration-accent underline-offset-2"
              href="/api/docs"
              target="_blank"
              rel="noreferrer"
            >
              /api/docs
            </a>
          </span>
          <span className="ml-auto flex items-center gap-3 font-mono">
            <span>visibility enforced by Postgres RLS</span>
            <span aria-hidden>·</span>
            <button
              onClick={refreshHealth}
              className="inline-flex items-center gap-1 underline decoration-accent underline-offset-2"
            >
              <ArrowClockwise className="h-3 w-3" /> refresh health
            </button>
          </span>
        </div>
      </footer>
    </div>
  )
}
