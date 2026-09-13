import { Grain } from '@/components/grain'
import { SiteNav } from '@/components/marketing/site-nav'
import { SiteFooter } from '@/components/marketing/site-footer'

/**
 * Marketing shell — shared by every public page: home, features, pricing,
 * about, privacy, terms. App pages (/journal, /auth, /invites) sit outside
 * this group deliberately.
 */
export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-paper text-ink">
      <Grain />
      <SiteNav />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  )
}
