'use client'

import { useEffect, useRef, useState } from 'react'

type LiveStatus = 'connecting' | 'connected' | 'disconnected'

export function useLiveUpdates(): {
  status: LiveStatus
  lastUpdate: Date | null
} {
  const [status, setStatus] = useState<LiveStatus>('connecting')
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const reconnectAttempts = useRef(0)

  useEffect(() => {
    let eventSource: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let stopped = false

    const parsePayload = (event: MessageEvent) => {
      if (!event?.data) {
        return null
      }
      try {
        return JSON.parse(event.data as string)
      } catch {
        return null
      }
    }

    const connect = () => {
      if (stopped) {
        return
      }

      setStatus('connecting')
      eventSource = new EventSource('/api/events')

      eventSource.onopen = () => {
        setStatus('connected')
        reconnectAttempts.current = 0
      }

      const markUpdate = () => {
        setLastUpdate(new Date())
      }

      eventSource.addEventListener('ingest', (event) => {
        const payload = parsePayload(event)
        const status = payload?.status as string | undefined
        if (!status || status === 'complete' || status === 'skipped' || status === 'error') {
          markUpdate()
        }
      })
      eventSource.addEventListener('metrics', markUpdate)

      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close()
        }
        setStatus('disconnected')

        if (stopped) {
          return
        }

        const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000)
        reconnectAttempts.current += 1
        reconnectTimer = setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      stopped = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
      }
      if (eventSource) {
        eventSource.close()
      }
    }
  }, [])

  return { status, lastUpdate }
}
