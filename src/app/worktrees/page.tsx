'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Activity, GitBranch, Trash2, Search } from 'lucide-react'

import { useDateRange } from '@/hooks/use-date-range'
import { useWorktrees, useWorktreeEvents } from '@/hooks/use-worktrees'
import { ChartCard } from '@/components/dashboard/chart-card'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { WorktreeActiveChart, WorktreeVolumeChart } from '@/components/worktrees/worktree-charts'
import { KpiSkeleton, TableSkeleton } from '@/components/shared/loading-skeleton'
import { ErrorState } from '@/components/shared/error-state'
import { EmptyState } from '@/components/shared/empty-state'
import { StatusBadge } from '@/components/shared/status-badge'
import { Input } from '@/components/ui/input'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function getTrend(delta: number | null): 'neutral' | 'up' | 'down' {
  if (delta === null) return 'neutral'
  if (delta > 0) return 'up'
  if (delta < 0) return 'down'
  return 'neutral'
}

export default function WorktreesPage() {
  const { range } = useDateRange()
  const { data, error, isLoading, refresh } = useWorktrees(range)

  const [page, setPage] = useState(1)
  const [pageSize] = useState(25)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [search])

  const eventsQuery = {
    range,
    page,
    pageSize,
    search: debouncedSearch || undefined,
  }

  const {
    data: eventsData,
    error: eventsError,
    isLoading: eventsLoading,
    refresh: refreshEvents,
  } = useWorktreeEvents(eventsQuery)

  const series = data?.series?.daily ?? []
  const kpis = data?.kpis

  const kpiItems = kpis
    ? [
        {
          label: 'Active worktrees',
          value: kpis.active.value,
          change: kpis.active.deltaPct ?? 0,
          trend: getTrend(kpis.active.delta),
          icon: <Activity className="h-4 w-4" />,
        },
        {
          label: 'Worktrees created',
          value: kpis.created.value,
          change: kpis.created.deltaPct ?? 0,
          trend: getTrend(kpis.created.delta),
          icon: <GitBranch className="h-4 w-4" />,
        },
        {
          label: 'Worktrees archived',
          value: kpis.deleted.value,
          change: kpis.deleted.deltaPct ?? 0,
          trend: getTrend(kpis.deleted.delta),
          icon: <Trash2 className="h-4 w-4" />,
        },
        {
          label: 'Errors',
          value: kpis.errors.value,
          change: kpis.errors.deltaPct ?? 0,
          trend: getTrend(kpis.errors.delta),
          icon: <AlertTriangle className="h-4 w-4" />,
        },
        {
          label: 'Failure rate',
          value: kpis.failureRate.value,
          change: kpis.failureRate.deltaPct ?? 0,
          trend: getTrend(kpis.failureRate.delta),
          icon: <AlertTriangle className="h-4 w-4" />,
          isPercent: true,
        },
      ]
    : []

  const totalPages = eventsData ? Math.ceil(eventsData.pagination.total / pageSize) : 0

  return (
    <div className="space-y-6">
      {isLoading && !data && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <KpiSkeleton key={index} />
          ))}
        </div>
      )}

      {error && !data && (
        <ErrorState
          description="We couldn’t load worktree metrics. Try refreshing."
          onRetry={refresh}
        />
      )}

      {data && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {kpiItems.map((item) => (
            <KpiCard key={item.label} {...item} />
          ))}
        </div>
      )}

      {data && series.length === 0 && (
        <EmptyState
          title="No worktree activity yet"
          description="Once Codex desktop logs are ingested, worktree trends will appear here."
        />
      )}

      {data && series.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="Worktrees created vs archived" description="Daily worktree volume">
            <WorktreeVolumeChart data={series} />
          </ChartCard>
          <ChartCard title="Active worktrees" description="Running total per day">
            <WorktreeActiveChart data={series} />
          </ChartCard>
        </div>
      )}

      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="relative w-64 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search worktree events..."
              className="pl-9 h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {eventsLoading && !eventsData && <TableSkeleton rows={6} />}

        {eventsError && !eventsData && (
          <div className="p-6">
            <ErrorState
              description="We couldn’t load worktree events. Try refreshing."
              onRetry={refreshEvents}
            />
          </div>
        )}

        {eventsData && (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">Time</TableHead>
                <TableHead className="w-32">Action</TableHead>
                <TableHead className="min-w-0 max-w-[260px]">Path</TableHead>
                <TableHead className="w-40">Branch</TableHead>
                <TableHead className="w-28 text-right">Status</TableHead>
                <TableHead className="max-w-[200px]">Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eventsData.events.map((event) => {
                const actionLabel = event.action === 'deleted' ? 'archived' : event.action
                return (
                  <TableRow key={event.id} className="hover:bg-muted/40">
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(event.ts).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-medium capitalize">{actionLabel}</TableCell>
                    <TableCell
                      className="min-w-0 max-w-[260px] truncate text-xs text-muted-foreground"
                      title={event.worktreePath ?? event.repoRoot ?? undefined}
                    >
                      {event.worktreePath ?? event.repoRoot ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {event.branch ?? '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <StatusBadge status={event.status ?? 'unknown'} />
                    </TableCell>
                    <TableCell
                      className="max-w-[200px] truncate text-xs text-muted-foreground"
                      title={event.error ?? undefined}
                    >
                      {event.error ?? '—'}
                    </TableCell>
                  </TableRow>
                )
              })}
              {eventsData.events.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    No worktree events recorded.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center px-4 py-3 border-t">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-disabled={page <= 1 || eventsLoading}
                    className={
                      page <= 1 || eventsLoading
                        ? 'pointer-events-none opacity-50'
                        : 'cursor-pointer'
                    }
                  />
                </PaginationItem>
                <PaginationItem>
                  <span className="text-sm text-muted-foreground px-4">
                    Page {page} of {totalPages || 1}
                  </span>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    aria-disabled={page >= totalPages || eventsLoading}
                    className={
                      page >= totalPages || eventsLoading
                        ? 'pointer-events-none opacity-50'
                        : 'cursor-pointer'
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
        {eventsData && (
          <div className="border-t px-4 py-3 text-xs text-muted-foreground">
            Showing {eventsData.events.length} of {eventsData.pagination.total} events
          </div>
        )}
      </div>
    </div>
  )
}
