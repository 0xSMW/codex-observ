'use client'

import { useMemo } from 'react'
import type { DateRange } from 'react-day-picker'

import type { ProjectsResponse } from '@/types/api'
import { useApiData } from '@/hooks/use-api'
import { useLiveUpdatesContext } from '@/hooks/use-live-updates-context'

export type ProjectsQuery = {
  page: number
  pageSize: number
  search?: string
  range?: DateRange
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export function useProjects(query: ProjectsQuery) {
  const { lastUpdate } = useLiveUpdatesContext()

  const params = useMemo(() => {
    const search = new URLSearchParams({
      page: String(query.page),
      pageSize: String(query.pageSize),
    })
    if (query.search) search.set('search', query.search)
    if (query.range?.from) search.set('startDate', query.range.from.toISOString())
    if (query.range?.to) search.set('endDate', query.range.to.toISOString())
    if (query.sortBy) search.set('sortBy', query.sortBy)
    if (query.sortOrder) search.set('sortOrder', query.sortOrder)
    return search.toString()
  }, [
    query.page,
    query.pageSize,
    query.search,
    query.range?.from,
    query.range?.to,
    query.sortBy,
    query.sortOrder,
  ])

  const url = `/api/projects?${params}`

  return useApiData<ProjectsResponse>(url, undefined, {
    refreshInterval: 30000,
    refreshKey: lastUpdate,
  })
}
