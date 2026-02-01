'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { useDateRange } from '@/hooks/use-date-range'
import { useSessions } from '@/hooks/use-sessions'
import { useSessionsMedians } from '@/hooks/use-sessions-medians'
import { useModels } from '@/hooks/use-models'
import { useProviders } from '@/hooks/use-providers'
import { useProjects } from '@/hooks/use-projects'
import { SessionFilters, type SessionFiltersValue } from '@/components/sessions/session-filters'
import { SessionsMediansTiles } from '@/components/sessions/sessions-medians-charts'
import { SessionsTable } from '@/components/sessions/sessions-table'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { ErrorState } from '@/components/shared/error-state'
import { Button } from '@/components/ui/button'

const PAGE_SIZE = 20

export default function SessionsPage() {
  const { range } = useDateRange()
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<SessionFiltersValue>({
    search: '',
    model: 'all',
    provider: 'all',
    project: 'all',
  })

  const query = {
    page,
    pageSize: PAGE_SIZE,
    query: filters.search || undefined,
    models: filters.model !== 'all' ? [filters.model] : undefined,
    providers: filters.provider !== 'all' ? [filters.provider] : undefined,
    project: filters.project !== 'all' ? filters.project : undefined,
    range,
  }

  const { data, error, isLoading, refresh } = useSessions(query)
  const { data: mediansData } = useSessionsMedians(range)
  const { data: modelsData } = useModels()
  const { data: providersData } = useProviders()
  const { data: projectsData } = useProjects({
    page: 1,
    pageSize: 100,
    range,
  })

  const models = useMemo(() => {
    const fromApi = modelsData?.models?.map((model) => model.model) ?? []
    if (fromApi.length > 0) return fromApi
    const set = new Set<string>()
    data?.sessions?.forEach((session) => {
      if (session.modelProvider) set.add(session.modelProvider)
    })
    return Array.from(set)
  }, [data, modelsData])

  const providers = useMemo(() => {
    const fromApi = providersData?.providers?.map((provider) => provider.provider) ?? []
    if (fromApi.length > 0) return fromApi
    const set = new Set<string>()
    data?.sessions?.forEach((session) => {
      if (session.modelProvider) set.add(session.modelProvider)
    })
    return Array.from(set)
  }, [data, providersData])

  const projects = useMemo(() => {
    const list = projectsData?.projects ?? []
    return list.map((p) => ({ id: p.id, name: p.name || p.id }))
  }, [projectsData])

  const totalPages = data ? Math.ceil(data.pagination.total / PAGE_SIZE) : 1

  return (
    <div className="space-y-6">
      {mediansData?.summary ? <SessionsMediansTiles summary={mediansData.summary} /> : null}

      <SessionFilters
        value={filters}
        models={models}
        providers={providers}
        projects={projects}
        onChange={(next) => {
          setFilters(next)
          setPage(1)
        }}
      />

      {isLoading && !data && <TableSkeleton rows={8} />}

      {error && !data && (
        <ErrorState description="We couldn’t load sessions. Try refreshing." onRetry={refresh} />
      )}

      {data && <SessionsTable sessions={data.sessions} />}

      {data && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
