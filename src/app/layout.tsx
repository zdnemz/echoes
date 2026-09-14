import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Newsreader } from 'next/font/google'
import './globals.css'
// Editor theme — global CSS may only enter through the root layout.
import '@mdxeditor/editor/style.css'
import { Providers } from '@/components/providers'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const newsreader = Newsreader({
  variable: '--font-newsreader',
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['opsz'],
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Echoes — a quiet place for loud thoughts',
    template: '%s · Echoes',
  },
  description:
    'Echoes is a private journal: markdown entries with moods and tags, notebooks you keep to yourself, and the one notebook you choose to share with the people who matter. Built by Stillwater Studio.',
  keywords: ['journal', 'notebook', 'markdown', 'mood', 'private', 'Echoes'],
  icons: { icon: '/logo.svg' },
  openGraph: {
    title: 'Echoes',
    description: 'A quiet place for loud thoughts — a private journal with one shared notebook.',
    siteName: 'Echoes',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Echoes',
    description: 'A quiet place for loud thoughts — a private journal with one shared notebook.',
  },
}

export const viewport: Viewport = {
  themeColor: '#faf6ee',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
