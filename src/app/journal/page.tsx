import type { Metadata } from 'next'
import { Workspace } from '@/components/journal/workspace'

export const metadata: Metadata = {
  title: 'Your journal',
  description: 'Your notebooks, entries, moods, tags, search, groups and shared notebooks.',
}

export default function JournalPage() {
  return <Workspace />
}
