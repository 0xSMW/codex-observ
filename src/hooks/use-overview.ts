'use client'

import { useMemo } from 'react'
import type { DateRange } from 'react-day-picker'

import type { OverviewResponse } from '@/types/api'
import { useApiData } from '@/hooks/use-api'
import { useLiveUpdatesContext } from '@/hooks/use-live-updates-context'

export type OverviewQuery = {
  range: DateRange
  project?: string
}

export function useOverview(query: OverviewQuery) {
  const { lastUpdate } = useLiveUpdatesContext()

  const params = useMemo(() => {
    if (!query.range?.from || !query.range?.to) return ''
    const search = new URLSearchParams({
      startDate: query.range.from.toISOString(),
      endDate: query.range.to.toISOString(),
    })
    if (query.project) search.set('project', query.project)
    return search.toString()
  }, [query.range?.from, query.range?.to, query.project])

  const url = params ? `/api/overview?${params}` : '/api/overview'

  return useApiData<OverviewResponse>(url, undefined, {
    refreshInterval: 30000,
    refreshKey: lastUpdate,
  })
}
