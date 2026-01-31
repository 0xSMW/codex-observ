"use client"

import { useCallback, useMemo } from "react"
import type { DateRange } from "react-day-picker"

import {
  buildMockSessions,
} from "@/lib/constants"
import type { SessionsResponse } from "@/types/api"
import { useApiData } from "@/hooks/use-api"

export type SessionsQuery = {
  page: number
  pageSize: number
  query?: string
  models?: string[]
  providers?: string[]
  range?: DateRange
}

export function useSessions(query: SessionsQuery) {
  const params = useMemo(() => {
    const search = new URLSearchParams({
      page: String(query.page),
      pageSize: String(query.pageSize),
    })
    if (query.query) search.set("search", query.query)
    if (query.models?.length) search.set("models", query.models.join(","))
    if (query.providers?.length)
      search.set("providers", query.providers.join(","))
    if (query.range?.from)
      search.set("startDate", query.range.from.toISOString())
    if (query.range?.to)
      search.set("endDate", query.range.to.toISOString())
    return search.toString()
  }, [query])

  const fallback = useCallback((): SessionsResponse => {
    const seed = buildMockSessions(120)
    const start = (query.page - 1) * query.pageSize
    const paged = seed.sessions.slice(start, start + query.pageSize)
    return {
      ...seed,
      sessions: paged,
      pagination: {
        ...seed.pagination,
        limit: query.pageSize,
        pageSize: query.pageSize,
        offset: start,
        page: query.page,
      },
    }
  }, [query.page, query.pageSize])

  const url = `/api/sessions?${params}`

  return useApiData<SessionsResponse>(url, fallback, {
    refreshInterval: 30000,
  })
}
