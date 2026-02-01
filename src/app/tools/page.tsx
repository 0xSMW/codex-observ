'use client'

import { useState } from 'react'
import { TerminalSquare, Timer, CheckCircle2, AlertTriangle, Search } from 'lucide-react'

import { useDateRange } from '@/hooks/use-date-range'
import { useToolCalls, ToolCallsQuery } from '@/hooks/use-tool-calls'
import { KpiGrid } from '@/components/dashboard/kpi-grid'
import { ChartSkeleton, KpiSkeleton, TableSkeleton } from '@/components/shared/loading-skeleton'
import { ErrorState } from '@/components/shared/error-state'
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
import {
  formatCompactNumber,
  formatDuration,
  formatDurationSeconds,
  formatPercent,
} from '@/lib/constants'
import { ToolFailureChart, ToolUsageChart } from '@/components/tools/tool-charts'

export default function ToolsPage() {
  const { range } = useDateRange()
  const [page, setPage] = useState(1)
  const [pageSize] = useState(25)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce search
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    const timer = setTimeout(() => {
      setDebouncedSearch(e.target.value)
      setPage(1) // Reset page on search
    }, 500)
    return () => clearTimeout(timer)
  }

  const query: ToolCallsQuery = {
    range,
    page,
    pageSize,
    search: debouncedSearch || undefined,
  }

  const { data, error, isLoading, refresh } = useToolCalls(query)

  const summary = data?.summary
  const breakdown = data?.breakdown

  const kpiItems = summary
    ? [
        {
          label: 'Success rate',
          value: summary.successRate,
          change:
            summary.prevSuccessRate !== null && summary.prevSuccessRate > 0
              ? (summary.successRate - summary.prevSuccessRate) / summary.prevSuccessRate
              : 0,
          trend:
            summary.successRate - (summary.prevSuccessRate ?? summary.successRate) > 0
              ? ('up' as const)
              : summary.successRate - (summary.prevSuccessRate ?? summary.successRate) < 0
                ? ('down' as const)
                : ('neutral' as const),
          icon: <CheckCircle2 className="h-4 w-4" />,
          isPercent: true,
        },
        {
          label: 'Avg duration',
          value: summary.avgDurationMs,
          change:
            summary.prevAvgDurationMs !== null && summary.prevAvgDurationMs > 0
              ? (summary.avgDurationMs - summary.prevAvgDurationMs) / summary.prevAvgDurationMs
              : 0,
          trend:
            summary.avgDurationMs - (summary.prevAvgDurationMs ?? summary.avgDurationMs) > 0
              ? ('up' as const)
              : summary.avgDurationMs - (summary.prevAvgDurationMs ?? summary.avgDurationMs) < 0
                ? ('down' as const)
                : ('neutral' as const),
          icon: <Timer className="h-4 w-4" />,
          formatValue: formatDurationSeconds,
        },
        {
          label: 'Total calls',
          value: summary.total,
          change:
            summary.prevTotal !== null && summary.prevTotal > 0
              ? (summary.total - summary.prevTotal) / summary.prevTotal
              : 0,
          trend:
            summary.total - (summary.prevTotal ?? summary.total) > 0
              ? ('up' as const)
              : summary.total - (summary.prevTotal ?? summary.total) < 0
                ? ('down' as const)
                : ('neutral' as const),
          icon: <TerminalSquare className="h-4 w-4" />,
        },
        {
          label: 'Failures',
          value: summary.failed,
          change:
            summary.prevFailed !== null && summary.prevFailed > 0
              ? (summary.failed - summary.prevFailed) / summary.prevFailed
              : 0,
          trend:
            summary.failed - (summary.prevFailed ?? summary.failed) > 0
              ? ('up' as const)
              : summary.failed - (summary.prevFailed ?? summary.failed) < 0
                ? ('down' as const)
                : ('neutral' as const),
          icon: <AlertTriangle className="h-4 w-4" />,
        },
      ]
    : []

  const totalPages = data ? Math.ceil(data.pagination.total / pageSize) : 0

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
        <ErrorState description="We couldn’t load tool calls. Try refreshing." onRetry={refresh} />
      )}

      {data && <KpiGrid items={kpiItems} />}

      {breakdown && (
        <div className="grid gap-6 md:grid-cols-2">
          <ToolUsageChart data={breakdown.tools} />
          <ToolFailureChart data={breakdown.failures} />
        </div>
      )}

      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="relative w-64 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search commands..."
              className="pl-9 h-9"
              value={search}
              onChange={handleSearchChange}
            />
          </div>
        </div>

        {isLoading && !data && <TableSkeleton rows={5} />}

        {data && (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Tool</TableHead>
                <TableHead className="min-w-0 max-w-[280px]">Command</TableHead>
                <TableHead className="text-right w-16">Exit</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="text-right">Status</TableHead>
                <TableHead className="max-w-[160px]">Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.toolCalls.map((call) => (
                <TableRow key={call.id} className="hover:bg-muted/40">
                  <TableCell className="font-medium">{call.toolName}</TableCell>
                  <TableCell
                    className="min-w-0 max-w-[280px] truncate text-xs text-muted-foreground"
                    title={call.command ?? undefined}
                  >
                    <span className="block truncate">{call.command ?? '—'}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {call.exitCode !== null ? call.exitCode : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDuration(call.durationMs === null ? Number.NaN : call.durationMs)}
                  </TableCell>
                  <TableCell className="text-right">
                    <StatusBadge status={call.status} />
                  </TableCell>
                  <TableCell
                    className="max-w-[160px] truncate text-xs text-muted-foreground"
                    title={call.error ?? undefined}
                  >
                    {call.error ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
              {data.toolCalls.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    No tool calls recorded.
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
                    aria-disabled={page <= 1 || isLoading}
                    className={
                      page <= 1 || isLoading ? 'pointer-events-none opacity-50' : 'cursor-pointer'
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
                    aria-disabled={page >= totalPages || isLoading}
                    className={
                      page >= totalPages || isLoading
                        ? 'pointer-events-none opacity-50'
                        : 'cursor-pointer'
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
        <div className="border-t px-4 py-3 text-xs text-muted-foreground">
          {data && (
            <>
              Showing {data.toolCalls.length} of {data.pagination.total} calls · Success rate:{' '}
              {formatPercent(summary?.successRate ?? 0)}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
