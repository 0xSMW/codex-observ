'use client'

import type { ProjectsResponse } from '@/types/api'
import type { ProjectsQuery } from '@/hooks/use-projects'

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Track ongoing requests to prevent duplicates
const ongoingRequests = new Map<string, Promise<ProjectsResponse>>()

function getCacheInstance(): Map<string, { data: ProjectsResponse; timestamp: number }> {
  if (typeof window !== 'undefined' && (window as any).__prewarmCache) {
    return (window as any).__prewarmCache
  }
  // Fallback to module-level cache if context isn't available
  if (!(globalThis as any).__fallbackPrewarmCache) {
    ;(globalThis as any).__fallbackPrewarmCache = new Map()
  }
  return (globalThis as any).__fallbackPrewarmCache
}

export function createProjectsQuery(query: ProjectsQuery) {
  const cache = getCacheInstance()
  const cacheKey = getCacheKey(query)

  // Check if we have fresh cached data
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return Promise.resolve(cached.data)
  }

  // Check if there's already an ongoing request for this key
  const ongoingRequest = ongoingRequests.get(cacheKey)
  if (ongoingRequest) {
    return ongoingRequest
  }

  // Fetch and cache the data
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
  })
  if (query.search) params.set('search', query.search)
  if (query.range?.from) params.set('startDate', query.range.from.toISOString())
  if (query.range?.to) params.set('endDate', query.range.to.toISOString())
  if (query.sortBy) params.set('sortBy', query.sortBy)
  if (query.sortOrder) params.set('sortOrder', query.sortOrder)

  const url = `/api/projects?${params.toString()}`

  const requestPromise = fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`)
      }
      return response.json() as Promise<ProjectsResponse>
    })
    .then((data) => {
      // Cache the successful response
      cache.set(cacheKey, { data, timestamp: Date.now() })
      return data
    })
    .catch((error) => {
      console.warn('Prewarming failed:', error)
      throw error
    })
    .finally(() => {
      // Clean up the ongoing request tracker
      ongoingRequests.delete(cacheKey)
    })

  // Track the ongoing request
  ongoingRequests.set(cacheKey, requestPromise)

  return requestPromise
}

export function getCachedProjects(query: ProjectsQuery): ProjectsResponse | null {
  const cache = getCacheInstance()
  const cacheKey = getCacheKey(query)
  const cached = cache.get(cacheKey)

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }

  return null
}

export function invalidateProjectsCache() {
  const cache = getCacheInstance()
  cache.clear()
  ongoingRequests.clear()
}

function getCacheKey(query: ProjectsQuery): string {
  const key = {
    page: query.page,
    pageSize: query.pageSize,
    search: query.search || '',
    startDate: query.range?.from?.toISOString() || '',
    endDate: query.range?.to?.toISOString() || '',
    sortBy: query.sortBy || 'lastSeen',
    sortOrder: query.sortOrder || 'desc',
  }

  return JSON.stringify(key)
}
