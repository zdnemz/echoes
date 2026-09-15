'use client'

/**
 * The journal workspace — the whole product surface after sign-in.
 *
 * Architecture:
 *  - one view state machine (notebook / compose / entry / search / groups),
 *    driven locally for an instant, app-like feel;
 *  - the rail (notebooks + groups) and the top bar (search, user) frame it;
 *  - every sub-view stays motion- and data-dumb (data via react-query).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import { List, MagnifyingGlass } from '@phosphor-icons/react/dist/ssr'
import { Wordmark } from '@/components/brand'
import { Grain } from '@/components/grain'
import { UnconfiguredNotice } from '@/components/unconfigured'
import { Rail } from './rail'
import { NotebookView } from './notebook-view'
import { EntryEditor } from './entry-editor'
import { GroupsView } from './groups-view'
import { ReflectView } from './reflect-view'
import { SearchView } from './search-view'
import { SettingsView } from './settings-view'
import { UserMenu } from './user-menu'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useSession } from '@/lib/auth/session'
import { useCreateNotebook, useNotebooks } from '@/lib/api/hooks'
import { useVaultStatus } from '@/lib/crypto/use-vault'
import { isUnconfigured } from '@/lib/api/client'
import { VaultGate } from './vault-gate'

export type View =
  | { kind: 'notebook'; notebookId: string }
  | { kind: 'compose'; notebookId: string; fromGroup?: string }
  | { kind: 'entry'; entryId: string; notebookId: string; fromGroup?: string }
  | { kind: 'search'; q: string }
  | { kind: 'groups' }
  | { kind: 'group'; groupId: string }
  | { kind: 'reflect' }
  | { kind: 'settings' }

export function viewFromSlugAndSearch(
  slug?: string[] | null,
  searchParams?: { get: (k: string) => string | null } | null,
): View | null {
  if (!slug || slug.length === 0) return null
  const [section, id] = slug
  if (section === 'notebooks' && id) {
    return { kind: 'notebook', notebookId: id }
  }
  if (section === 'entries' && id) {
    return {
      kind: 'entry',
      entryId: id,
      notebookId: searchParams?.get('notebookId') || '',
      fromGroup: searchParams?.get('fromGroup') || undefined,
    }
  }
  if (section === 'groups') {
    if (id) return { kind: 'group', groupId: id }
    return { kind: 'groups' }
  }
  if (section === 'compose') {
    return {
      kind: 'compose',
      notebookId: searchParams?.get('notebookId') || '',
      fromGroup: searchParams?.get('fromGroup') || undefined,
    }
  }
  if (section === 'search') {
    return { kind: 'search', q: searchParams?.get('q') || '' }
  }
  if (section === 'reflect') {
    return { kind: 'reflect' }
  }
  if (section === 'settings') {
    return { kind: 'settings' }
  }
  return null
}

export function urlFromView(v: View): string {
  switch (v.kind) {
    case 'notebook':
      return `/journal/notebooks/${v.notebookId}`
    case 'entry': {
      const q = new URLSearchParams()
      if (v.notebookId) q.set('notebookId', v.notebookId)
      if (v.fromGroup) q.set('fromGroup', v.fromGroup)
      const qs = q.toString()
      return `/journal/entries/${v.entryId}${qs ? `?${qs}` : ''}`
    }
    case 'compose': {
      const q = new URLSearchParams()
      if (v.notebookId) q.set('notebookId', v.notebookId)
      if (v.fromGroup) q.set('fromGroup', v.fromGroup)
      const qs = q.toString()
      return `/journal/compose${qs ? `?${qs}` : ''}`
    }
    case 'groups':
      return '/journal/groups'
    case 'group':
      return `/journal/groups/${v.groupId}`
    case 'search':
      return `/journal/search${v.q ? `?q=${encodeURIComponent(v.q)}` : ''}`
    case 'reflect':
      return '/journal/reflect'
    case 'settings':
      return '/journal/settings'
  }
}

// --------------------------------------------------------------- restoring

function RestoreSkeleton() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper text-ink">
      <header className="h-16 border-b border-line" />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6 md:flex-row">
        <div className="w-full space-y-3 md:w-64">
          <div className="skeleton-line h-3 w-20" />
          <div className="skeleton-line h-9 w-full" />
          <div className="skeleton-line h-9 w-4/5" />
          <div className="skeleton-line h-9 w-3/5" />
        </div>
        <div className="flex-1 space-y-4">
          <div className="skeleton-line h-8 w-56" />
          <div className="skeleton-line h-4 w-32" />
          <div className="skeleton-line h-20 w-full" />
          <div className="skeleton-line h-20 w-full" />
        </div>
      </div>
    </div>
  )
}

function SignedOutGate() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-start justify-center bg-paper px-6 text-ink sm:px-10">
      <Wordmark className="text-xl" />
      <p className="mt-6 max-w-[46ch] font-serif text-lg leading-relaxed text-ink-soft">
        This room is for account holders. Taking you back to the front door…
      </p>
      <Link
        href="/login"
        className="mt-6 font-mono text-[11px] uppercase tracking-[0.16em] text-clay-ink underline underline-offset-4"
      >
        sign in or create an account
      </Link>
    </div>
  )
}

// --------------------------------------------------------------- workspace

export function Workspace() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const params = useParams<{ slug?: string[] }>()
  const { status: sessionStatus } = useSession()
  const vaultStatus = useVaultStatus()
  const [railOpen, setRailOpen] = useState(false)

  // ---- session gate
  useEffect(() => {
    if (sessionStatus === 'anonymous') {
      const qs = searchParams?.toString()
      const fullPath = pathname + (qs ? `?${qs}` : '')
      const safeReturnTo =
        fullPath.startsWith('/journal') && !fullPath.startsWith('//') && !fullPath.includes('\\')
          ? fullPath
          : '/journal'
      router.replace(`/login?return_to=${encodeURIComponent(safeReturnTo)}`)
    }
  }, [sessionStatus, pathname, searchParams, router])

  const notebooks = useNotebooks()
  // Memoized: a fresh [] each render would invalidate the memo below on every
  // render (and it is a dependency of the view-selection memo).
  const all = useMemo(() => notebooks.data?.data ?? [], [notebooks.data])

  const urlView = useMemo(() => viewFromSlugAndSearch(params?.slug, searchParams), [params?.slug, searchParams])

  // Auto-redirect to first notebook when at bare /journal
  useEffect(() => {
    if (sessionStatus !== 'authenticated') return
    if (!params?.slug || params.slug.length === 0) {
      if (notebooks.isSuccess && all.length > 0) {
        router.replace(urlFromView({ kind: 'notebook', notebookId: all[0].id }))
      }
    }
  }, [sessionStatus, params?.slug, notebooks.isSuccess, all, router])

  // ---- derived view from URL + notebooks loaded
  const view = useMemo<View | null>(() => {
    if (urlView) {
      const needsNotebook = urlView.kind === 'notebook'
      if (needsNotebook && all.length > 0 && !all.some((nb) => nb.id === urlView.notebookId)) {
        return { kind: 'notebook', notebookId: all[0].id }
      }
      return urlView
    }
    return all.length > 0 ? { kind: 'notebook', notebookId: all[0].id } : null
  }, [urlView, all])

  const navigate = useCallback(
    (next: View) => {
      router.push(urlFromView(next))
      setRailOpen(false)
    },
    [router],
  )

  const unconfigured = notebooks.isError && isUnconfigured(notebooks.error) && sessionStatus === 'authenticated'

  // --------------------------------------------------------------- render

  if (sessionStatus === 'restoring') return <RestoreSkeleton />
  if (sessionStatus !== 'authenticated') return <SignedOutGate />

  // Authenticated but the E2EE vault is locked (fresh tab, OAuth sign-in,
  // stale stash) — everything below needs the keys, so the gate comes first.
  // Give auto-unlock a beat to finish before demanding the password.
  if (vaultStatus === false && notebooks.data !== undefined) return <VaultGate />

  const search = (q: string) => {
    if (q.trim()) navigate({ kind: 'search', q: q.trim() })
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper text-ink">
      <Grain />

      {/* ------------------------------------------------ top bar */}
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setRailOpen(true)}
            className="press -ml-1 rounded-md p-2 text-ink-soft hover:bg-paper-deep lg:hidden"
            aria-label="Open navigation"
          >
            <List className="h-5 w-5" />
          </button>

          <Link href="/journal" aria-label="Echoes journal" className="press text-base">
            <Wordmark />
          </Link>

          {/* mobile search — the desktop field is sm+ only */}
          <button
            type="button"
            onClick={() => navigate({ kind: 'search', q: '' })}
            className="press ml-auto rounded-md p-2 text-ink-soft hover:bg-paper-deep sm:hidden"
            aria-label="Search your entries"
          >
            <MagnifyingGlass className="h-5 w-5" />
          </button>

          <form
            className="ml-auto hidden w-72 items-center sm:flex"
            onSubmit={(e) => {
              e.preventDefault()
              const input = e.currentTarget.elements.namedItem('q') as HTMLInputElement | null
              if (input) search(input.value)
            }}
          >
            <div className="relative w-full">
              <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <input
                name="q"
                type="search"
                placeholder="search your entries…"
                aria-label="Search your entries"
                className="h-9 w-full rounded-md border border-line bg-paper-raised pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-faint focus:border-clay-soft focus:outline-none focus:ring-2 focus:ring-clay-soft/40"
              />
            </div>
          </form>

          <UserMenu onNavigate={navigate} />
        </div>
      </header>

      {/* ------------------------------------------------ body */}
      <div className="mx-auto flex w-full max-w-[1440px] flex-1 items-stretch px-0 sm:px-6">
        {/* desktop rail */}
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-64 shrink-0 overflow-y-auto py-6 pr-5 lg:block">
          <Rail notebooks={all} view={view} onNavigate={navigate} />
        </aside>

        {/* mobile rail */}
        <Sheet open={railOpen} onOpenChange={setRailOpen}>
          <SheetContent side="left" className="w-72 overflow-y-auto bg-paper p-5">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Rail notebooks={all} view={view} onNavigate={navigate} embedded />
          </SheetContent>
        </Sheet>

        {/* main */}
        <main className="min-w-0 flex-1 py-6 lg:py-8 lg:pl-7">
          {unconfigured ? (
            <div className="mx-4 lg:mx-0 lg:max-w-2xl">
              <h1 className="font-display text-2xl text-ink">Almost there</h1>
              <p className="mt-2 text-[13.5px] text-ink-soft">
                You&apos;re signed in — the data layer just isn&apos;t connected on this deployment yet.
              </p>
              <div className="mt-5">
                <UnconfiguredNotice />
              </div>
            </div>
          ) : view === null ? (
            notebooks.isLoading ? (
              <div className="mx-4 space-y-4 lg:mx-0" aria-label="Loading notebooks">
                <div className="skeleton-line h-8 w-52" />
                <div className="skeleton-line h-4 w-32" />
                <div className="skeleton-line h-20 w-full" />
              </div>
            ) : (
              <FirstRunGate onNavigate={navigate} />
            )
          ) : view.kind === 'notebook' ? (
            <NotebookView notebookId={view.notebookId} onNavigate={navigate} />
          ) : view.kind === 'compose' || view.kind === 'entry' ? (
            <EntryEditor
              key={view.kind === 'compose' ? `compose:${view.notebookId}` : `entry:${view.entryId}`}
              mode={
                view.kind === 'compose'
                  ? { compose: true, notebookId: view.notebookId, fromGroup: view.fromGroup }
                  : { compose: false, entryId: view.entryId, fromGroup: view.fromGroup }
              }
              onNavigate={navigate}
            />
          ) : view.kind === 'search' ? (
            <SearchView initialQuery={view.q} onNavigate={navigate} />
          ) : view.kind === 'reflect' ? (
            <ReflectView />
          ) : view.kind === 'settings' ? (
            <SettingsView />
          ) : (
            <GroupsView selectedGroupId={view.kind === 'group' ? view.groupId : null} onNavigate={navigate} />
          )}
        </main>
      </div>
    </div>
  )
}

// --------------------------------------------------------------- bits

/** No notebooks yet — a composed empty state instead of a dead screen. */
function FirstRunGate({ onNavigate }: { onNavigate: (v: View) => void }) {
  const create = useCreateNotebook()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = async (title: string) => {
    setCreating(true)
    setError(null)
    try {
      const nb = await create.mutateAsync({ title })
      onNavigate({ kind: 'notebook', notebookId: nb.id })
    } catch (err) {
      // Previously the rejection was unhandled: the buttons simply re-enabled
      // and nothing happened — the worst possible first interaction.
      setError(
        isUnconfigured(err)
          ? "The journal backend isn't connected on this deployment, so a notebook can't be created yet."
          : err instanceof Error
            ? err.message
            : "Couldn't create the notebook.",
      )
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="mx-4 max-w-lg lg:mx-0">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-clay">first run</p>
      <h1 className="font-display mt-4 text-3xl leading-tight text-ink">A journal begins with one notebook.</h1>
      <p className="mt-4 max-w-[54ch] text-[14px] leading-relaxed text-ink-soft">
        Give it a name that makes you want to open it — &ldquo;Morning pages&rdquo;, &ldquo;Field notes&rdquo;,
        &ldquo;The kitchen table&rdquo;. You can share this one later, or never; the rest stay yours alone.
      </p>
      <div className="mt-6 flex flex-wrap gap-2.5">
        {['Morning pages', 'Field notes', 'Kitchen table', 'Overnight thoughts'].map((t) => (
          <button
            key={t}
            type="button"
            disabled={creating}
            onClick={() => start(t)}
            className="press rounded-full border border-line bg-paper-raised px-4 py-2 text-[13px] text-ink-soft hover:border-clay-soft hover:text-ink disabled:opacity-50"
          >
            {t}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-[12.5px] leading-relaxed text-ember">
          {error}
        </p>
      )}
    </div>
  )
}
