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
  const [lead, ...rest] = QUOTES
  return (
    <section className="border-t-[3px] border-foreground">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <p className="inline-block border-2 border-foreground bg-foreground px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-background">
          04 — In their words
        </p>
        <div className="mt-10 grid gap-6 lg:grid-cols-12">
          <figure
            key={lead.name}
            className="flex flex-col border-2 border-foreground bg-accent p-7 text-background shadow-brutal lg:col-span-7"
          >
            <blockquote className="font-mono text-xl font-black uppercase leading-snug md:text-2xl">
              "{lead.quote}"
            </blockquote>
            <figcaption className="mt-auto pt-6">
              <p className="inline-block bg-foreground px-2 py-1 font-mono text-[12.5px] font-bold uppercase text-background">
                {lead.name}
              </p>
              <p className="mt-2 font-mono text-[10.5px] font-bold uppercase tracking-widest">{lead.context}</p>
            </figcaption>
          </figure>
          <div className="grid gap-6 lg:col-span-5">
            {rest.map((q) => (
              <figure
                key={q.name}
                className="flex flex-col border-2 border-foreground bg-background p-6 shadow-brutal-sm"
              >
                <blockquote className="text-[15px] font-bold leading-relaxed">"{q.quote}"</blockquote>
                <figcaption className="mt-auto pt-5">
                  <p className="text-[12.5px] font-black uppercase">{q.name}</p>
                  <p className="mt-0.5 border-l-4 border-accent pl-2 font-mono text-[10.5px] font-bold uppercase">
                    {q.context}
                  </p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
