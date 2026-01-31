"use client"

import { buildMockProviders } from "@/lib/constants"
import type { ProvidersResponse } from "@/types/api"
import { useApiData } from "@/hooks/use-api"

export function useProviders() {
  return useApiData<ProvidersResponse>("/api/providers", buildMockProviders, {
    refreshInterval: 60000,
  })
}
