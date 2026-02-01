'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveUpdatesContext } from '@/hooks/use-live-updates-context'

export function useSyncStatus(): {
  lastSyncedAt: number | null
  triggerSync: () => Promise<void>
  isSyncing: boolean
} {
  const { lastUpdate } = useLiveUpdatesContext()
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
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

  const triggerSync = useCallback(async () => {
    if (isSyncing) return
    setIsSyncing(true)
    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'incremental' }),
      })
      if (res.ok) {
        await fetchSyncStatus()
      }
    } finally {
      setIsSyncing(false)
    }
  }, [isSyncing, fetchSyncStatus])

  useEffect(() => {
    fetchSyncStatus()
  }, [fetchSyncStatus])

  useEffect(() => {
    if (lastUpdateTime != null && lastUpdateTime !== prevRefreshKey.current) {
      prevRefreshKey.current = lastUpdateTime
      void fetchSyncStatus()
    }
  }, [lastUpdateTime, fetchSyncStatus])

  return { lastSyncedAt, triggerSync, isSyncing }
}
