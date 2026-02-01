"use client"

import type { ModelsResponse } from "@/types/api"
import { useApiData } from "@/hooks/use-api"
import { useLiveUpdatesContext } from "@/hooks/use-live-updates-context"

export function useModels() {
  const { lastUpdate } = useLiveUpdatesContext()
  
  return useApiData<ModelsResponse>("/api/models", undefined, {
    refreshInterval: 60000,
    refreshKey: lastUpdate,
  })
}
