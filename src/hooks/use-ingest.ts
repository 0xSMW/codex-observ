'use client'

import { useMemo } from 'react'

import type { IngestStatusResponse } from '@/types/api'
import { useApiData } from '@/hooks/use-api'
import { useLiveUpdatesContext } from '@/hooks/use-live-updates-context'

export type IngestQuery = {
  page: number
  pageSize: number
  search?: string
}

export function useIngest(query: IngestQuery) {
  const { lastUpdate } = useLiveUpdatesContext()

  const params = useMemo(() => {
    const search = new URLSearchParams({
      page: String(query.page),
      pageSize: String(query.pageSize),
    })
    if (query.search) search.set('search', query.search)
    return search.toString()
  }, [query.page, query.pageSize, query.search])

  const url = `/api/ingest?${params}`

  return useApiData<IngestStatusResponse>(url, undefined, {
    refreshInterval: 30000,
    refreshKey: lastUpdate,
  })
}
