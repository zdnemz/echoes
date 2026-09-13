/**
 * Shared page header for the inner marketing pages — eyebrow, display title,
 * measure-constrained lede. Server component.
 */

export function PageHeader({ eyebrow, title, lede }: { eyebrow: string; title: string; lede?: string }) {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-6 pt-16 sm:px-6 md:pt-24">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-clay">{eyebrow}</p>
      <h1 className="font-display mt-5 max-w-[24ch] text-[2.4rem] leading-[1.05] tracking-tight text-ink md:text-5xl">
        {title}
      </h1>
      {lede ? <p className="measure mt-6 text-[15.5px] leading-relaxed text-ink-soft">{lede}</p> : null}
    </div>
  )
}
