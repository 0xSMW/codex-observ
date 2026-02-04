'use client'

import type { DesktopLogStatusResponse } from '@/types/api'
import { useApiData } from '@/hooks/use-api'
import { useLiveUpdatesContext } from '@/hooks/use-live-updates-context'

export function useDesktopLogStatus() {
  const { lastUpdate } = useLiveUpdatesContext()
  return useApiData<DesktopLogStatusResponse>('/api/desktop-logs/status', undefined, {
    refreshInterval: 30000,
    refreshKey: lastUpdate,
  })
}
