'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type ApiState<T> = {
  data: T | null
  error: Error | null
  isLoading: boolean
  isFallback: boolean
  refresh: () => void
}

export function useApiData<T>(
  url: string | null,
  fallback?: () => T,
  options?: { refreshInterval?: number; refreshKey?: number | Date | null }
): ApiState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(url))
  const [isFallback, setIsFallback] = useState<boolean>(false)
  const abortRef = useRef<AbortController | null>(null)

  const fetchData = useCallback(() => {
    if (!url) {
      setIsLoading(false)
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsLoading(true)

    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        const text = await response.text()
        if (!response.ok) {
          let message = `Request failed (${response.status})`
          try {
            const body = JSON.parse(text) as { error?: string }
            if (typeof body?.error === 'string') message = body.error
          } catch {
            // ignore non-JSON body (e.g. HTML error page)
          }
          throw new Error(message)
        }
        return JSON.parse(text) as T
      })
      .then((json) => {
        setData(json)
        setError(null)
        setIsFallback(false)
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return
        setError(err)
        if (fallback) {
          setData(fallback())
          setIsFallback(true)
        }
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [url, fallback])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData()
    return () => {
      abortRef.current?.abort()
    }
  }, [fetchData])

  useEffect(() => {
    if (!options?.refreshInterval) return
    const interval = window.setInterval(fetchData, options.refreshInterval)
    return () => window.clearInterval(interval)
  }, [fetchData, options?.refreshInterval])

  // Refetch when refreshKey changes (triggered by SSE events)
  const refreshKeyValue =
    options?.refreshKey instanceof Date ? options.refreshKey.getTime() : options?.refreshKey
  const prevRefreshKey = useRef(refreshKeyValue)
  useEffect(() => {
    if (refreshKeyValue && refreshKeyValue !== prevRefreshKey.current) {
      prevRefreshKey.current = refreshKeyValue
      fetchData()
    }
  }, [refreshKeyValue, fetchData])

  return { data, error, isLoading, isFallback, refresh: fetchData }
}
