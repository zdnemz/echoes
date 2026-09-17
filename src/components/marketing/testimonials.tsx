const QUOTES = [
  {
    quote: 'This is the first app that just shuts up and holds the page.',
    name: 'Ines V.',
    context: 'Daily writer',
  },
  {
    quote: 'Shared entries feel like leaving notes on the kitchen counter.',
    name: 'Rowan T.',
    context: 'Shared notebook',
  },
  {
    quote: 'Scrolling back a month of glyphs says more than any chart.',
    name: 'Priya M.',
    context: '3 years journaling',
  },
]

export function Testimonials() {
  return (
    <section className="border-b-[3px] border-foreground py-14 md:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8">
          <p className="inline-block border-2 border-foreground bg-foreground px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.2em] text-background">
            Writers
          </p>
          <h2 className="font-display mt-3 text-3xl uppercase md:text-4xl">What writers say</h2>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {QUOTES.map((q, i) => (
            <figure
              key={q.name}
              className={`flex flex-col justify-between border-2 border-foreground p-6 shadow-brutal ${
                i === 0 ? 'bg-accent text-background' : 'bg-background text-foreground'
              }`}
            >
              <blockquote className="font-mono text-base font-bold uppercase leading-snug">"{q.quote}"</blockquote>
              <figcaption className="mt-6 border-t-2 border-current pt-4">
                <p className="font-mono text-xs font-black uppercase">{q.name}</p>
                <p className="font-mono text-[10px] font-bold uppercase opacity-80">{q.context}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
