import { Suspense } from 'react'
import type { Metadata } from 'next'
import { Workspace } from '@/components/journal/workspace'
import JournalLoading from '../loading'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your journal',
  description: 'Your notebooks, entries, moods, tags, search, groups and shared notebooks.',
}

export default function JournalPage() {
  return (
    <Suspense fallback={<JournalLoading />}>
      <Workspace />
    </Suspense>
  )
}
