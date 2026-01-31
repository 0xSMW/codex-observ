"use client"

import { useMemo } from "react"
import type { DateRange } from "react-day-picker"

import { buildMockOverviewResponse } from "@/lib/constants"
import type { OverviewResponse } from "@/types/api"
import { useApiData } from "@/hooks/use-api"

export function useOverview(range: DateRange) {
  const params = useMemo(() => {
    if (!range?.from || !range?.to) return ""
    const search = new URLSearchParams({
      startDate: range.from.toISOString(),
      endDate: range.to.toISOString(),
    })
    return search.toString()
  }, [range])

  const url = params ? `/api/overview?${params}` : "/api/overview"

  return useApiData<OverviewResponse>(url, buildMockOverviewResponse, {
    refreshInterval: 30000,
  })
}
