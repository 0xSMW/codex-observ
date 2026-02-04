'use client'

import { useMemo } from 'react'
import type { DateRange } from 'react-day-picker'

import type { AutomationsResponse, AutomationEventsResponse } from '@/types/api'
import { useApiData } from '@/hooks/use-api'
import { useLiveUpdatesContext } from '@/hooks/use-live-updates-context'

export type AutomationEventsQuery = {
  range?: DateRange | null
  page?: number
  pageSize?: number
  search?: string
}

export function useAutomations(range?: DateRange | null) {
  const { lastUpdate } = useLiveUpdatesContext()

  const params = useMemo(() => {
    const searchParams = new URLSearchParams()
    if (range?.from) searchParams.set('startDate', range.from.toISOString())
    if (range?.to) searchParams.set('endDate', range.to.toISOString())
    return searchParams.toString()
  }, [range])

  const url = params ? `/api/automations?${params}` : '/api/automations'

  return useApiData<AutomationsResponse>(url, undefined, {
    refreshInterval: 30000,
    refreshKey: lastUpdate,
  })
}

export function useAutomationEvents(query: AutomationEventsQuery) {
  const { lastUpdate } = useLiveUpdatesContext()

  const params = useMemo(() => {
    const searchParams = new URLSearchParams()
    if (query.range?.from) searchParams.set('startDate', query.range.from.toISOString())
    if (query.range?.to) searchParams.set('endDate', query.range.to.toISOString())
    if (query.page) searchParams.set('page', query.page.toString())
    if (query.pageSize) searchParams.set('pageSize', query.pageSize.toString())
    if (query.search) searchParams.set('search', query.search)
    return searchParams.toString()
  }, [query])

  const url = params ? `/api/automations/events?${params}` : '/api/automations/events'

  return useApiData<AutomationEventsResponse>(url, undefined, {
    refreshInterval: 30000,
    refreshKey: lastUpdate,
  })
}
