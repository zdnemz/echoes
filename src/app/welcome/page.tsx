import type { Metadata } from 'next'
import { WelcomeName } from '@/components/auth/welcome-name'

export const metadata: Metadata = {
  title: 'Welcome — pick your name',
  description: 'New accounts start by choosing the display name shared notebooks use.',
  robots: { index: false, follow: false },
}

export default function WelcomePage() {
  return <WelcomeName />
}
