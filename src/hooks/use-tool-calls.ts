'use client'

import type { ToolCallsResponse } from '@/types/api'
import { useApiData } from '@/hooks/use-api'
import { useLiveUpdatesContext } from '@/hooks/use-live-updates-context'

export function useToolCalls() {
  const { lastUpdate } = useLiveUpdatesContext()

  return useApiData<ToolCallsResponse>('/api/tool-calls', undefined, {
    refreshInterval: 30000,
    refreshKey: lastUpdate,
  })
}
