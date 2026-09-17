'use client'

/**
 * Live status dot for the footer — an isolated, memoized client island.
 * Probes /api/health quietly (20s), renders a breathing dot + mono label.
 */

import { memo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getHealth } from '@/lib/api/endpoints'

export const LiveStatusDot = memo(function LiveStatusDot() {
  const { data } = useQuery({
    queryKey: ['health', 'footer'],
    queryFn: getHealth,
    refetchInterval: 20_000,
    staleTime: 15_000,
    retry: false,
  })

  const apiOk = data?.status === 'ok'

  return (
    <span className="inline-flex items-center gap-2 font-mono text-[10.5px] font-bold uppercase text-background/80">
      <span className={`h-2 w-2 ${apiOk ? 'bg-accent' : 'bg-destructive'}`} />
      {apiOk ? 'api live' : 'api unreachable'}
    </span>
  )
})
