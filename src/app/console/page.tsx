import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ApiConsole } from '@/components/console/api-console'

export const metadata: Metadata = {
  title: 'API console',
  description:
    'Developer console for the Journaling API — live health, endpoint catalog from the OpenAPI document, and an auth sandbox.',
  robots: { index: false, follow: false },
}

/**
 * Developer-only surface: mounted in development (and preview builds that
 * run with NODE_ENV != production); production deployments get a 404.
 */
export default function ConsolePage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return <ApiConsole />
}
