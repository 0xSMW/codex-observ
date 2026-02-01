'use client'

import type { SessionDetailResponse } from '@/types/api'
import { useApiData } from '@/hooks/use-api'
import { useLiveUpdatesContext } from '@/hooks/use-live-updates-context'

export function useSessionDetail(id?: string) {
  const { lastUpdate } = useLiveUpdatesContext()

  const url = id ? `/api/sessions/${id}` : null
  return useApiData<SessionDetailResponse>(url, undefined, {
    refreshKey: lastUpdate,
  })
}
