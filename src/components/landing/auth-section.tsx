import { AuthPanel } from '@/components/landing/auth-panel'

export function AuthSection() {
  return (
    <section id="begin" className="scroll-mt-16 bg-foreground text-background py-14 md:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-5">
            <p className="inline-block bg-accent px-2 py-0.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.2em] text-background">
              Get Started
            </p>
            <h2 className="font-display mt-3 text-3xl uppercase md:text-5xl">Start your first notebook.</h2>
            <p className="mt-4 max-w-[40ch] border-l-4 border-accent pl-4 text-base font-bold leading-relaxed text-background/80">
              No card required. Your first notebook is waiting.
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
