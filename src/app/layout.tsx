import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Newsreader } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'
import { ServiceWorkerRegistrar } from '@/components/pwa/service-worker-registrar'

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
  manifest: '/manifest.webmanifest',
  // iOS Safari ignores the manifest for home-screen install; these meta tags
  // are what actually make "Add to Home Screen" produce a standalone app.
  appleWebApp: {
    capable: true,
    title: 'Echoes',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/logo.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icons/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
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
        <Providers>
          <ServiceWorkerRegistrar />
          {children}
        </Providers>
      </body>
    </html>
  )
}
