"use client"

import { useMemo } from "react"

import { buildMockSessionDetail } from "@/lib/constants"
import type { SessionDetailResponse } from "@/types/api"
import { useApiData } from "@/hooks/use-api"

export function useSessionDetail(id?: string) {
  const fallback = useMemo(() => {
    if (!id) return undefined
    return () => buildMockSessionDetail(id)
  }, [id])

  const url = id ? `/api/sessions/${id}` : null
  return useApiData<SessionDetailResponse>(url, fallback)
}
