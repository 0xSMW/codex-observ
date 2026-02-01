'use client'

import { TerminalSquare, Timer, CheckCircle2, AlertTriangle } from 'lucide-react'

import { useToolCalls } from '@/hooks/use-tool-calls'
import { KpiGrid } from '@/components/dashboard/kpi-grid'
import { ChartSkeleton, KpiSkeleton } from '@/components/shared/loading-skeleton'
import { ErrorState } from '@/components/shared/error-state'
import { StatusBadge } from '@/components/shared/status-badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCompactNumber, formatDuration, formatPercent } from '@/lib/constants'

export default function ToolsPage() {
  const { data, error, isLoading, refresh } = useToolCalls()

  const summary = data?.summary

  const kpiItems = summary
    ? [
        {
          label: 'Success rate',
          value: summary.successRate,
          change: summary.prevSuccessRate !== null && summary.prevSuccessRate > 0 
            ? (summary.successRate - summary.prevSuccessRate) / summary.prevSuccessRate 
            : 0,
          trend: (summary.successRate - (summary.prevSuccessRate ?? summary.successRate)) > 0 
            ? 'up' as const 
            : (summary.successRate - (summary.prevSuccessRate ?? summary.successRate)) < 0 
              ? 'down' as const 
              : 'neutral' as const,
          icon: <CheckCircle2 className="h-4 w-4" />,
          isPercent: true,
        },
        {
          label: 'Avg duration',
          value: summary.avgDurationMs,
          change: summary.prevAvgDurationMs !== null && summary.prevAvgDurationMs > 0
            ? (summary.avgDurationMs - summary.prevAvgDurationMs) / summary.prevAvgDurationMs
            : 0,
          trend: (summary.avgDurationMs - (summary.prevAvgDurationMs ?? summary.avgDurationMs)) > 0
            ? 'up' as const
            : (summary.avgDurationMs - (summary.prevAvgDurationMs ?? summary.avgDurationMs)) < 0
              ? 'down' as const
              : 'neutral' as const,
          icon: <Timer className="h-4 w-4" />,
          formatValue: formatDuration,
        },
        {
          label: 'Total calls',
          value: summary.total,
          change: summary.prevTotal !== null && summary.prevTotal > 0
            ? (summary.total - summary.prevTotal) / summary.prevTotal
            : 0,
          trend: (summary.total - (summary.prevTotal ?? summary.total)) > 0
            ? 'up' as const
            : (summary.total - (summary.prevTotal ?? summary.total)) < 0
              ? 'down' as const
              : 'neutral' as const,
          icon: <TerminalSquare className="h-4 w-4" />,
        },
        {
          label: 'Failures',
          value: summary.failed,
          change: summary.prevFailed !== null && summary.prevFailed > 0
            ? (summary.failed - summary.prevFailed) / summary.prevFailed
            : 0,
          trend: (summary.failed - (summary.prevFailed ?? summary.failed)) > 0
            ? 'up' as const
            : (summary.failed - (summary.prevFailed ?? summary.failed)) < 0
              ? 'down' as const
              : 'neutral' as const,
          icon: <AlertTriangle className="h-4 w-4" />,
        },
      ]
    : []

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

      {isLoading && data && <ChartSkeleton />}

      {data && (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tool</TableHead>
                <TableHead>Command</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.toolCalls.map((call) => (
                <TableRow key={call.id} className="hover:bg-muted/40">
                  <TableCell className="font-medium">{call.toolName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {call.command ?? '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDuration(call.durationMs === null ? Number.NaN : call.durationMs)}
                  </TableCell>
                  <TableCell className="text-right">
                    <StatusBadge status={call.status} />
                  </TableCell>
                </TableRow>
              ))}
              {data.toolCalls.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    No tool calls recorded.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="border-t px-4 py-3 text-xs text-muted-foreground">
            Success rate: {formatPercent(summary?.successRate ?? 0)} · Average duration:{' '}
            {formatDuration(summary?.avgDurationMs ?? 0)} ·{' '}
            {formatCompactNumber(summary?.total ?? 0)} total calls
          </div>
        </div>
      )}
    </div>
  )
}
