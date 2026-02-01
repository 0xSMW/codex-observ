"use client"

import type { ProvidersResponse } from "@/types/api"
import { useApiData } from "@/hooks/use-api"
import { useLiveUpdatesContext } from "@/hooks/use-live-updates-context"

export function useProviders() {
  const { lastUpdate } = useLiveUpdatesContext()
  
  return useApiData<ProvidersResponse>("/api/providers", undefined, {
    refreshInterval: 60000,
    refreshKey: lastUpdate,
  })
}

