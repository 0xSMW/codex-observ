'use client'

import { useMemo } from 'react'
import { CalendarDays, Coins, MessageSquare, Users, Zap } from 'lucide-react'

import { useActivity } from '@/hooks/use-activity'
import { useOverview } from '@/hooks/use-overview'
import { ActivityHeatmap } from '@/components/activity/heatmap'
import { CostChart } from '@/components/dashboard/cost-chart'
import { ChartCard } from '@/components/dashboard/chart-card'
import { ErrorState } from '@/components/shared/error-state'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { KpiSkeleton } from '@/components/shared/loading-skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCompactNumber } from '@/lib/constants'

export default function ActivityPage() {
  const year = new Date().getFullYear()
  const { data, error, isLoading, refresh } = useActivity(year)

  const ytdRange = useMemo(
    () => ({
      from: new Date(year, 0, 1),
      to: new Date(year, 11, 31, 23, 59, 59),
    }),
    [year]
  )
  const { data: overviewData, isLoading: overviewLoading } = useOverview(ytdRange)
  const costSeries = overviewData?.series?.daily ?? []

  const summary = data?.summary

  const calcChange = (current: number, previous?: number) => {
    if (!previous) return 0
    return ((current - previous) / previous) * 100
  }

  // Order: tokens, days, sessions, messages, calls
  const kpiItems = summary
    ? [
        {
          label: 'Tokens',
          value: summary.totalTokens,
          change: calcChange(summary.totalTokens, summary.prevTotalTokens),
          trend: 'neutral' as const,
          icon: <Coins className="h-4 w-4" />,
          formatValue: formatCompactNumber,
        },
        {
          label: 'Active days',
          value: summary.activeDays,
          change: calcChange(summary.activeDays, summary.prevActiveDays),
          trend: 'neutral' as const,
          icon: <CalendarDays className="h-4 w-4" />,
        },
        {
          label: 'Sessions',
          value: summary.totalSessions,
          change: calcChange(summary.totalSessions, summary.prevTotalSessions),
          trend: 'neutral' as const,
          icon: <Users className="h-4 w-4" />,
        },
        {
          label: 'Messages',
          value: summary.totalMessages,
          change: calcChange(summary.totalMessages, summary.prevTotalMessages),
          trend: 'neutral' as const,
          icon: <MessageSquare className="h-4 w-4" />,
        },
        {
          label: 'Calls',
          value: summary.totalCalls,
          change: calcChange(summary.totalCalls, summary.prevTotalCalls),
          trend: 'neutral' as const,
          icon: <Zap className="h-4 w-4" />,
        },
      ]
    : []

  return (
    <div className="space-y-6">
      {isLoading && !data && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
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

      {data && (
        <div className="w-full overflow-hidden rounded-lg border bg-card p-6">
          <h3 className="text-base font-semibold">Activity heatmap</h3>
          <p className="mt-1 text-sm text-muted-foreground">Token throughput by day for {year}</p>
          <div className="mt-6 w-full min-w-0 overflow-x-auto">
            <ActivityHeatmap year={year} data={data} />
          </div>
        </div>
      )}

      {data && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {kpiItems.map((item) => (
            <KpiCard key={item.label} {...item} />
          ))}
        </div>
      )}

      {data && (
        <div className="w-full">
          <ChartCard
            title="Estimated cost"
            description={`Daily estimated cost for ${year} based on model pricing`}
          >
            {overviewLoading ? (
              <Skeleton className="max-h-[400px] w-full" />
            ) : (
              <CostChart data={costSeries} className="max-h-[400px] w-full" />
            )}
          </ChartCard>
        </div>
      )}
    </div>
  )
}
