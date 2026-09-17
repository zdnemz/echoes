import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthPanel } from '@/components/landing/auth-panel'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to Echoes — your notebooks are waiting.',
  alternates: { canonical: '/login' },
}

export default function LoginPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-4 py-14 sm:px-6 md:py-20">
      <p className="border-2 border-foreground bg-foreground px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-background">
        Welcome back
      </p>
      <h1 className="font-display mt-4 max-w-[20ch] text-center text-3xl uppercase md:text-4xl">
        Sign in to your notebooks.
      </h1>
      <div className="mt-8 flex w-full justify-center">
        <AuthPanel initialTab="signin" />
      </div>
      <p className="mt-6 text-[13px] font-bold">
        No account yet?{' '}
        <Link
          href="/register"
          className="border-b-[3px] border-accent font-black uppercase underline-offset-4 hover:bg-accent hover:text-background"
        >
          Create one
        </Link>
      </p>
    </div>
  )
}
