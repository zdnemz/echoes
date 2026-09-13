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
    <section id="begin" className="scroll-mt-16 border-t border-line bg-paper-deep">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-clay">04 — Begin</p>
            <h2 className="font-display mt-4 max-w-[14ch] text-3xl leading-tight tracking-tight text-ink md:text-4xl">
              Begin your first notebook.
            </h2>
            <p className="mt-5 max-w-[50ch] text-[14.5px] leading-relaxed text-ink-soft">
              An account is an email and a password — or just the email, if you prefer a one-time magic link. The first
              notebook is waiting, blank and patient.
            </p>

            <ul className="mt-8 divide-y divide-line border-y border-line">
              {CHECKLIST.map((item) => (
                <li key={item.title} className="py-4">
                  <p className="text-[13.5px] font-medium text-ink">{item.title}</p>
                  <p className="mt-1.5 max-w-[52ch] text-[12.5px] leading-relaxed text-ink-faint">{item.body}</p>
                </li>
              ))}
            </ul>

            <p className="mt-6 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">
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
