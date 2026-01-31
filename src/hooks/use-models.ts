"use client"

import { buildMockModels } from "@/lib/constants"
import type { ModelsResponse } from "@/types/api"
import { useApiData } from "@/hooks/use-api"

export function useModels() {
  return useApiData<ModelsResponse>("/api/models", buildMockModels, {
    refreshInterval: 60000,
  })
}
