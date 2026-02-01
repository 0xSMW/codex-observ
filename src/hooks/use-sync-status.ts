'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveUpdatesContext } from '@/hooks/use-live-updates-context'

export function useSyncStatus(): { lastSyncedAt: number | null } {
  const { lastUpdate } = useLiveUpdatesContext()
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  const lastUpdateTime = lastUpdate?.getTime()
  const prevRefreshKey = useRef<number | null>(null)

  const fetchSyncStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/sync-status')
      if (!res.ok) return
      const json = (await res.json()) as { lastSyncedAt: number | null }
      setLastSyncedAt(json.lastSyncedAt ?? null)
    } catch {
      // Ignore fetch errors
    }
  }, [])

  useEffect(() => {
    fetchSyncStatus()
  }, [fetchSyncStatus])

  useEffect(() => {
    if (lastUpdateTime != null && lastUpdateTime !== prevRefreshKey.current) {
      prevRefreshKey.current = lastUpdateTime
      void fetchSyncStatus()
    }
  }, [lastUpdateTime, fetchSyncStatus])

  return { lastSyncedAt }
}
