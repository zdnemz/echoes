import type { Metadata } from 'next'
import { InviteAccept } from '@/components/invite/invite-accept'

export const metadata: Metadata = {
  title: "You're invited",
  description: 'Join a sharing circle on Echoes — the link is the invite.',
  robots: { index: false },
}

export default async function InviteAcceptPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  return <InviteAccept token={token ?? null} />
}
