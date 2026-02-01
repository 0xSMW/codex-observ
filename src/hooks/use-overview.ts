'use client'

import { useMemo } from 'react'
import type { DateRange } from 'react-day-picker'

import type { OverviewResponse } from '@/types/api'
import { useApiData } from '@/hooks/use-api'
import { useLiveUpdatesContext } from '@/hooks/use-live-updates-context'

export function useOverview(range: DateRange) {
  const { lastUpdate } = useLiveUpdatesContext()

  const params = useMemo(() => {
    if (!range?.from || !range?.to) return ''
    const search = new URLSearchParams({
      startDate: range.from.toISOString(),
      endDate: range.to.toISOString(),
    })
    return search.toString()
  }, [range])

  const url = params ? `/api/overview?${params}` : '/api/overview'

  return useApiData<OverviewResponse>(url, undefined, {
    refreshInterval: 30000,
    refreshKey: lastUpdate,
  })
}
