'use client'

import { useMemo } from 'react'
import type { DateRange } from 'react-day-picker'

import type { ModelsResponse } from '@/types/api'
import { useApiData } from '@/hooks/use-api'
import { useLiveUpdatesContext } from '@/hooks/use-live-updates-context'

export function useModels(range?: DateRange) {
  const { lastUpdate } = useLiveUpdatesContext()

  const params = useMemo(() => {
    if (!range?.from || !range?.to) return ''
    const search = new URLSearchParams({
      startDate: range.from.toISOString(),
      endDate: range.to.toISOString(),
    })
    return search.toString()
  }, [range?.from, range?.to])

  const url = params ? `/api/models?${params}` : '/api/models'

  return useApiData<ModelsResponse>(url, undefined, {
    refreshInterval: 60000,
    refreshKey: lastUpdate,
  })
}
