'use client'

import { useMemo } from 'react'
import type { DateRange } from 'react-day-picker'

import type { SessionsResponse } from '@/types/api'
import { useApiData } from '@/hooks/use-api'
import { useLiveUpdatesContext } from '@/hooks/use-live-updates-context'

export type SessionsQuery = {
  page: number
  pageSize: number
  query?: string
  models?: string[]
  providers?: string[]
  project?: string
  originator?: string
  cliVersion?: string
  branch?: string
  worktree?: string
  range?: DateRange
}

export function useSessions(query: SessionsQuery) {
  const { lastUpdate } = useLiveUpdatesContext()

  const params = useMemo(() => {
    const search = new URLSearchParams({
      page: String(query.page),
      pageSize: String(query.pageSize),
    })
    if (query.query) search.set('search', query.query)
    if (query.models?.length) search.set('models', query.models.join(','))
    if (query.providers?.length) search.set('providers', query.providers.join(','))
    if (query.project) search.set('project', query.project)
    if (query.originator) search.set('originator', query.originator)
    if (query.cliVersion) search.set('cliVersion', query.cliVersion)
    if (query.branch) search.set('branch', query.branch)
    if (query.worktree) search.set('worktree', query.worktree)
    if (query.range?.from) search.set('startDate', query.range.from.toISOString())
    if (query.range?.to) search.set('endDate', query.range.to.toISOString())
    return search.toString()
  }, [query])

  const url = `/api/sessions?${params}`

  return useApiData<SessionsResponse>(url, undefined, {
    refreshInterval: 30000,
    refreshKey: lastUpdate,
  })
}
