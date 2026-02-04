'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Inbox, Search } from 'lucide-react'

import { useDateRange } from '@/hooks/use-date-range'
import { useAutomations, useAutomationEvents } from '@/hooks/use-automations'
import { ChartCard } from '@/components/dashboard/chart-card'
import { KpiCard } from '@/components/dashboard/kpi-card'
import {
  AutomationBacklogChart,
  AutomationRunsChart,
} from '@/components/automations/automation-charts'
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

export default function AutomationsPage() {
  const { range } = useDateRange()
  const { data, error, isLoading, refresh } = useAutomations(range)

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
  } = useAutomationEvents(eventsQuery)

  const series = data?.series?.daily ?? []
  const kpis = data?.kpis

  const kpiItems = kpis
    ? [
        {
          label: 'Runs queued',
          value: kpis.queued.value,
          change: kpis.queued.deltaPct ?? 0,
          trend: getTrend(kpis.queued.delta),
          icon: <Inbox className="h-4 w-4" />,
        },
        {
          label: 'Runs completed',
          value: kpis.completed.value,
          change: kpis.completed.deltaPct ?? 0,
          trend: getTrend(kpis.completed.delta),
          icon: <CheckCircle2 className="h-4 w-4" />,
        },
        {
          label: 'Runs failed',
          value: kpis.failed.value,
          change: kpis.failed.deltaPct ?? 0,
          trend: getTrend(kpis.failed.delta),
          icon: <AlertTriangle className="h-4 w-4" />,
        },
        {
          label: 'Backlog peak',
          value: kpis.backlogPeak.value,
          change: kpis.backlogPeak.deltaPct ?? 0,
          trend: getTrend(kpis.backlogPeak.delta),
          icon: <Clock className="h-4 w-4" />,
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <KpiSkeleton key={index} />
          ))}
        </div>
      )}

      {error && !data && (
        <ErrorState
          description="We couldn’t load automation metrics. Try refreshing."
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
          title="No automation activity yet"
          description="Once Codex desktop logs are ingested, automation trends will appear here."
        />
      )}

      {data && series.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="Automation runs" description="Queued, completed, and failed per day">
            <AutomationRunsChart data={series} />
          </ChartCard>
          <ChartCard title="Backlog" description="Queued minus completed per day">
            <AutomationBacklogChart data={series} />
          </ChartCard>
        </div>
      )}

      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="relative w-64 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search automation events..."
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
              description="We couldn’t load automation events. Try refreshing."
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
                <TableHead className="min-w-0 max-w-[240px]">Thread</TableHead>
                <TableHead className="w-28 text-right">Status</TableHead>
                <TableHead className="max-w-[220px]">Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eventsData.events.map((event) => (
                <TableRow key={event.id} className="hover:bg-muted/40">
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(event.ts).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-medium capitalize">{event.action}</TableCell>
                  <TableCell
                    className="min-w-0 max-w-[240px] truncate text-xs text-muted-foreground"
                    title={event.threadId ?? undefined}
                  >
                    {event.threadId ?? '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <StatusBadge status={event.status ?? 'unknown'} />
                  </TableCell>
                  <TableCell
                    className="max-w-[220px] truncate text-xs text-muted-foreground"
                    title={event.error ?? undefined}
                  >
                    {event.error ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
              {eventsData.events.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    No automation events recorded.
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
