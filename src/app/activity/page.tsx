'use client'

import { CalendarDays, MessageSquare, Zap } from 'lucide-react'

import { useActivity } from '@/hooks/use-activity'
import { ActivityHeatmap } from '@/components/activity/heatmap'
import { ErrorState } from '@/components/shared/error-state'
import { KpiGrid } from '@/components/dashboard/kpi-grid'
import { KpiSkeleton } from '@/components/shared/loading-skeleton'

export default function ActivityPage() {
  const year = new Date().getFullYear()
  const { data, error, isLoading, refresh } = useActivity(year)

  const summary = data?.summary

  const kpiItems = summary
    ? [
        {
          label: 'Total messages',
          value: summary.totalMessages,
          change: 0,
          trend: 'neutral' as const,
          icon: <MessageSquare className="h-4 w-4" />,
        },
        {
          label: 'Total calls',
          value: summary.totalCalls,
          change: 0,
          trend: 'neutral' as const,
          icon: <Zap className="h-4 w-4" />,
        },
        {
          label: 'Active days',
          value: summary.activeDays,
          change: 0,
          trend: 'neutral' as const,
          icon: <CalendarDays className="h-4 w-4" />,
        },
      ]
    : []

  return (
    <div className="space-y-6">
      {isLoading && !data && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <KpiSkeleton key={index} />
          ))}
        </div>
      )}

      {error && !data && (
        <ErrorState
          description="We couldn’t load activity data. Try refreshing."
          onRetry={refresh}
        />
      )}

      {data && <KpiGrid items={kpiItems} />}

      {data && (
        <div className="rounded-lg border bg-card p-6">
          <h3 className="text-base font-semibold">Activity heatmap</h3>
          <p className="mt-1 text-sm text-muted-foreground">Token throughput by day for {year}</p>
          <div className="mt-6 overflow-x-auto">
            <ActivityHeatmap year={year} data={data} />
          </div>
        </div>
      )}
    </div>
  )
}
