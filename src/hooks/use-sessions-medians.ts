'use client'

import { useMemo } from 'react'
import type { DateRange } from 'react-day-picker'

import type { SessionsMediansResponse } from '@/types/api'
import { useApiData } from '@/hooks/use-api'
import { useLiveUpdatesContext } from '@/hooks/use-live-updates-context'

export function useSessionsMedians(range: DateRange | undefined) {
  const { lastUpdate } = useLiveUpdatesContext()

  const params = useMemo(() => {
    if (!range?.from || !range?.to) return ''
    const search = new URLSearchParams({
      startDate: range.from.toISOString(),
      endDate: range.to.toISOString(),
    })
    return search.toString()
  }, [range])

  const url = params ? `/api/sessions/medians?${params}` : '/api/sessions/medians'

  return useApiData<SessionsMediansResponse>(url, undefined, {
    refreshInterval: 30000,
    refreshKey: lastUpdate,
  })
}
