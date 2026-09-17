/**
 * Shared page header for the inner marketing pages — eyebrow, display title,
 * measure-constrained lede. Server component.
 */

export function PageHeader({ eyebrow, title, lede }: { eyebrow: string; title: string; lede?: string }) {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-10 pt-16 sm:px-6 md:pt-24">
      <p className="inline-block border-2 border-foreground bg-foreground px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-background">
        {eyebrow}
      </p>
      <h1 className="font-display mt-5 max-w-[24ch] text-[2.4rem] uppercase leading-[1.02] md:text-5xl">{title}</h1>
      {lede ? (
        <p className="measure mt-6 border-l-4 border-accent bg-muted p-4 text-[15px] font-bold leading-relaxed">
          {lede}
        </p>
      ) : null}
    </div>
  )
}
