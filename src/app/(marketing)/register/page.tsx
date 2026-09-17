import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthPanel } from '@/components/landing/auth-panel'

export const metadata: Metadata = {
  title: 'Create your account',
  description: 'Create an Echoes account — an email and a password, private by default.',
  alternates: { canonical: '/register' },
}

export default function RegisterPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-4 py-14 sm:px-6 md:py-20">
      <p className="border-2 border-foreground bg-foreground px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-background">
        Begin
      </p>
      <h1 className="font-display mt-4 max-w-[20ch] text-center text-3xl uppercase md:text-4xl">
        Begin your first notebook.
      </h1>
      <p className="mt-4 max-w-[52ch] border-l-4 border-accent pl-4 text-center text-[14px] font-bold leading-relaxed">
        An account is an email and a password — or just the email, if you prefer a one-time magic link.
      </p>
      <div className="mt-8 flex w-full justify-center">
        <AuthPanel initialTab="signup" />
      </div>
      <p className="mt-6 text-[13px] font-bold">
        Already have an account?{' '}
        <Link
          href="/login"
          className="border-b-[3px] border-accent font-black uppercase underline-offset-4 hover:bg-accent hover:text-background"
        >
          Sign in
        </Link>
      </p>
    </div>
  )
}
