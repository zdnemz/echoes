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
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-clay">Welcome back</p>
      <h1 className="font-display mt-4 max-w-[20ch] text-center text-3xl leading-tight tracking-tight text-ink md:text-4xl">
        Sign in to your notebooks.
      </h1>
      <div className="mt-8 flex w-full justify-center">
        <AuthPanel initialTab="signin" />
      </div>
      <p className="mt-6 text-[13px] text-ink-soft">
        No account yet?{' '}
        <Link href="/register" className="text-clay-ink underline underline-offset-4 hover:text-clay-deep">
          Create one
        </Link>
      </p>
    </div>
  )
}
