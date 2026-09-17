import { SiteNav } from '@/components/marketing/site-nav'
import { SiteFooter } from '@/components/marketing/site-footer'

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background font-mono text-foreground">
      <SiteNav />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  )
}
