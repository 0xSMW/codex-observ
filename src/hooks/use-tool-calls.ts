'use client'

import { useMemo } from 'react'
import type { DateRange } from 'react-day-picker'

import type { ToolCallsResponse } from '@/types/api'
import { useApiData } from '@/hooks/use-api'
import { useLiveUpdatesContext } from '@/hooks/use-live-updates-context'

export type ToolCallsQuery = {
  range?: DateRange | null
  page?: number
  pageSize?: number
  search?: string
  status?: string[]
  tools?: string[]
  exitCode?: number
  hasError?: boolean
  minDurationMs?: number
  maxDurationMs?: number
}

export function useToolCalls(query: ToolCallsQuery) {
  const { lastUpdate } = useLiveUpdatesContext()

  const params = useMemo(() => {
    const searchParams = new URLSearchParams()
    if (query.range?.from) searchParams.set('startDate', query.range.from.toISOString())
    if (query.range?.to) searchParams.set('endDate', query.range.to.toISOString())
    if (query.page) searchParams.set('page', query.page.toString())
    if (query.pageSize) searchParams.set('pageSize', query.pageSize.toString())
    if (query.search) searchParams.set('search', query.search)
    if (query.status?.length) searchParams.set('status', query.status.join(','))
    if (query.tools?.length) searchParams.set('tools', query.tools.join(','))
    if (query.exitCode !== undefined) searchParams.set('exitCode', String(query.exitCode))
    if (query.hasError !== undefined) searchParams.set('hasError', String(query.hasError))
    if (query.minDurationMs !== undefined)
      searchParams.set('minDurationMs', String(query.minDurationMs))
    if (query.maxDurationMs !== undefined)
      searchParams.set('maxDurationMs', String(query.maxDurationMs))
    return searchParams.toString()
  }, [query])

  const url = params ? `/api/tool-calls?${params}` : '/api/tool-calls'

  return useApiData<ToolCallsResponse>(url, undefined, {
    refreshInterval: 30000,
    refreshKey: lastUpdate,
  })
}
