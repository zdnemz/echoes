/**
 * Journal loading fallback.
 *
 * Scoped to /journal rather than the root layout: the marketing pages are
 * static and should never flash a skeleton.
 */
export default function JournalLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your journal…</span>
      <div className="skeleton-line h-4 w-40" />
      <div className="skeleton-line mt-6 h-9 w-72" />
      <div className="mt-8 space-y-3">
        <div className="skeleton-line h-14 w-full" />
        <div className="skeleton-line h-14 w-full" />
        <div className="skeleton-line h-14 w-full" />
      </div>
    </main>
  )
}
