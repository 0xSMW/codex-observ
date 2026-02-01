'use client'

import { useState, useMemo, useCallback } from 'react'
import { FolderGit2, MessageSquare, Cpu, DollarSign } from 'lucide-react'

import { useDateRange } from '@/hooks/use-date-range'
import { useProjects } from '@/hooks/use-projects'
import { formatCompactNumber, formatCurrency } from '@/lib/constants'
import { Input } from '@/components/ui/input'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { ErrorState } from '@/components/shared/error-state'
import { EmptyState } from '@/components/shared/empty-state'
import { KPIStatCard } from '@/components/shared/kpi-card'
import { ProjectsChart } from '@/components/projects/projects-chart'
import { createProjectColumns } from './columns'
import { ProjectsDataTable } from './projects-data-table'
import type { PaginationState } from '@tanstack/react-table'

const PAGE_SIZE = 20

export default function ProjectsPage() {
  const { range } = useDateRange()
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  })
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<string>('lastSeen')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const query = {
    page: pagination.pageIndex + 1,
    pageSize: pagination.pageSize,
    search: search || undefined,
    range,
    sortBy,
    sortOrder,
  }

  const { data, error, isLoading, refresh } = useProjects(query)

  const aggregates = data?.aggregates
  const totalPages = data ? Math.ceil(data.pagination.total / PAGE_SIZE) : 1

  const handleSort = useCallback((key: string) => {
    setSortBy((prev) => {
      if (prev === key) {
        setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
        return prev
      }
      setSortOrder('desc')
      return key
    })
    setPagination((p) => ({ ...p, pageIndex: 0 }))
  }, [])

  const columns = useMemo(
    () =>
      createProjectColumns({
        sortBy,
        sortOrder,
        onSort: handleSort,
      }),
    [sortBy, sortOrder, handleSort]
  )

  return (
    <div className="space-y-6">
      {aggregates && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KPIStatCard
            title="Total Projects"
            value={formatCompactNumber(aggregates.totalProjects)}
            icon={<FolderGit2 className="h-4 w-4 text-muted-foreground" />}
            description="Active in period"
          />
          <KPIStatCard
            title="Total Sessions"
            value={formatCompactNumber(aggregates.totalSessions)}
            icon={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
          />
          <KPIStatCard
            title="Total Tokens"
            value={formatCompactNumber(aggregates.totalTokens)}
            icon={<Cpu className="h-4 w-4 text-muted-foreground" />}
          />
          <KPIStatCard
            title="Est. Cost"
            value={formatCurrency(aggregates.totalCost)}
            icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
          />
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 lg:flex-row lg:items-center">
        <div className="flex-1">
          <Input
            placeholder="Search by project name or path"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPagination((prev) => ({ ...prev, pageIndex: 0 }))
            }}
          />
        </div>
      </div>

      {data && data.projects.length > 0 && <ProjectsChart projects={data.projects} />}

      {isLoading && !data && <TableSkeleton rows={8} />}

      {error && !data && (
        <ErrorState description="We couldn't load projects. Try refreshing." onRetry={refresh} />
      )}

      {data && data.projects.length === 0 && (
        <EmptyState
          title="No projects yet"
          description="Projects are derived from session workspaces. Run some Codex sessions to see project rollups here."
        />
      )}

      {data && data.projects.length > 0 && (
        <ProjectsDataTable
          columns={columns}
          data={data.projects}
          pagination={pagination}
          pageCount={totalPages}
          onPaginationChange={setPagination}
        />
      )}
    </div>
  )
}
