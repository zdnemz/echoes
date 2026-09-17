import type { Metadata } from 'next'
import { Hero } from '@/components/landing/hero'
import { FeatureStories } from '@/components/landing/features'
import { MoodStrip } from '@/components/landing/mood-strip'
import { PricingTeaser } from '@/components/marketing/pricing-teaser'
import { Testimonials } from '@/components/marketing/testimonials'
import { AuthSection } from '@/components/landing/auth-section'

export const metadata: Metadata = {
  title: 'Echoes — a quiet place for loud thoughts',
  description:
    'Echoes is a private journal: markdown entries with moods and tags, notebooks you keep to yourself, and the one notebook you choose to share with the people who matter. Free to start, $6/mo for Pro.',
  alternates: { canonical: '/' },
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <FeatureStories />
      <MoodStrip />
      <PricingTeaser />
      <Testimonials />
      <AuthSection />
    </>
  )
}
