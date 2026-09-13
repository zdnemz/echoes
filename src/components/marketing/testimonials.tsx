/**
 * Three quiet testimonials — editorial pull-quote treatment, no star ratings,
 no stock-photo avatars. Server component.
 */

const QUOTES = [
  {
    quote:
      'I stopped keeping a diary years ago because every app wanted to be a social network. This is the first one that just… shuts up and holds the page.',
    name: 'Ines V.',
    context: 'writes at 6 a.m., before the house wakes',
  },
  {
    quote:
      'My partner and I keep one shared notebook across a long-distance week. Entries land as they’re saved — it feels like leaving notes on the kitchen counter.',
    name: 'Rowan T.',
    context: 'two cities, one notebook',
  },
  {
    quote:
      'The mood dots are the whole product for me. Scrolling back a month of small glyphs says more than any chart would.',
    name: 'Priya M.',
    context: 'night-shift nurse, three years journaling',
  },
]

export function Testimonials() {
  return (
    <section className="border-t border-line bg-paper">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-clay">04 — In their words</p>
        <div className="mt-10 grid gap-10 md:grid-cols-3">
          {QUOTES.map((q) => (
            <figure key={q.name} className="flex flex-col border-l-2 border-clay/40 pl-5">
              <blockquote className="font-serif text-[15px] leading-relaxed text-ink">“{q.quote}”</blockquote>
              <figcaption className="mt-auto pt-5">
                <p className="text-[12.5px] font-medium text-ink">{q.name}</p>
                <p className="mt-0.5 font-mono text-[10.5px] text-ink-faint">{q.context}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
