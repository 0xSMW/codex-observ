"use client"

import { useMemo } from "react"

import { buildMockActivity } from "@/lib/constants"
import type { ActivityResponse } from "@/types/api"
import { useApiData } from "@/hooks/use-api"

export function useActivity(year: number) {
  const fallback = useMemo(() => () => buildMockActivity(year), [year])
  const start = new Date(year, 0, 1).toISOString()
  const end = new Date(year, 11, 31, 23, 59, 59).toISOString()
  const url = `/api/activity?startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`
  return useApiData<ActivityResponse>(url, fallback, {
    refreshInterval: 60000,
  })
}
