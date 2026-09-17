import { AuthPanel } from '@/components/landing/auth-panel'

const CHECKLIST = [
  {
    title: 'Private by default',
    body: 'Nothing leaves your account until you link a notebook to a group — and even then, per-entry opt-outs hold.',
  },
  {
    title: 'Markdown, moods, tags',
    body: 'Write in markdown, rate the day, tag it your way — then search all of it later, full-text.',
  },
  {
    title: 'One notebook, shared',
    body: 'Share exactly one notebook with a small circle. New entries land the second you save them.',
  },
]

export function AuthSection() {
  return (
    <section id="begin" className="scroll-mt-16 border-t-[3px] border-foreground bg-foreground text-background">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <p className="inline-block bg-accent px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-background">
              05 — Begin
            </p>
            <h2 className="font-display mt-4 max-w-[14ch] text-3xl uppercase md:text-4xl">
              Begin your first notebook.
            </h2>
            <p className="mt-5 max-w-[50ch] border-l-4 border-accent pl-4 text-[14.5px] font-bold leading-relaxed text-background/80">
              An account is an email and a password — or just the email, if you prefer a one-time magic link. The first
              notebook is waiting, blank and patient.
            </p>

            <ul className="mt-8 border-2 border-background">
              {CHECKLIST.map((item, i) => (
                <li key={item.title} className={`p-4 ${i > 0 ? 'border-t-2 border-background' : ''}`}>
                  <p className="font-mono text-[13.5px] font-black uppercase">
                    <span className="mr-2 bg-accent px-1.5 py-0.5 text-background">{i + 1}</span>
                    {item.title}
                  </p>
                  <p className="mt-1.5 max-w-[52ch] text-[12.5px] font-bold leading-relaxed text-background/70">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>

            <p className="mt-6 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-background/60">
              Google one-tap · email + password · or a one-time magic link
            </p>
          </div>

          <div className="flex lg:col-span-7 lg:justify-end">
            <AuthPanel initialTab="signup" />
          </div>
        </div>
      </div>
    </section>
  )
}
