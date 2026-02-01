"use client"

import type { ActivityResponse } from "@/types/api"
import { useApiData } from "@/hooks/use-api"
import { useLiveUpdatesContext } from "@/hooks/use-live-updates-context"

export function useActivity(year: number) {
  const { lastUpdate } = useLiveUpdatesContext()
  
  const start = new Date(year, 0, 1).toISOString()
  const end = new Date(year, 11, 31, 23, 59, 59).toISOString()
  const url = `/api/activity?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`
  return useApiData<ActivityResponse>(url, undefined, {
    refreshInterval: 60000,
    refreshKey: lastUpdate,
  })
}
