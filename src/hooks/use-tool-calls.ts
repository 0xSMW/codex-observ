"use client"

import { buildMockToolCalls } from "@/lib/constants"
import type { ToolCallsResponse } from "@/types/api"
import { useApiData } from "@/hooks/use-api"

export function useToolCalls() {
  return useApiData<ToolCallsResponse>("/api/tool-calls", buildMockToolCalls, {
    refreshInterval: 30000,
  })
}
