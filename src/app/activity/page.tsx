'use client'

import { useMemo } from 'react'
import { CalendarDays, Coins, MessageSquare, Users, Zap } from 'lucide-react'

import { useActivity } from '@/hooks/use-activity'
import { useOverview } from '@/hooks/use-overview'
import { ActivityHeatmap } from '@/components/activity/heatmap'
import { ChartCard } from '@/components/dashboard/chart-card'
import { CostChart } from '@/components/dashboard/cost-chart'
import { ErrorState } from '@/components/shared/error-state'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { KpiSkeleton } from '@/components/shared/loading-skeleton'
import { formatCompactNumber } from '@/lib/constants'

export default function ActivityPage() {
  const year = new Date().getFullYear()
  const { data, error, isLoading, refresh } = useActivity(year)

  const ytdRange = useMemo(
    () => ({
      from: new Date(year, 0, 1),
      to: new Date(year, 11, 31),
    }),
    [year]
  )
  const { data: overviewData } = useOverview(ytdRange)
  const costSeries = overviewData?.series?.daily ?? []

  const summary = data?.summary

  // Decimal change (0.5 = 50%) for formatPercent; same convention as overview KPIs
  const calcChange = (current: number, previous?: number | null): number => {
    if (previous == null || previous === 0) return 0
    return (current - previous) / previous
  }

  const getTrend = (change: number): 'up' | 'down' | 'neutral' => {
    if (change > 0) return 'up'
    if (change < 0) return 'down'
    return 'neutral'
  }

  const delta = (current: number, previous?: number | null) => {
    const change = calcChange(current, previous)
    return { change, trend: getTrend(change) }
  }

  // Order: tokens, days, sessions, messages, calls (change as decimal for formatPercent, same as overview)
  const kpiItems = summary
    ? [
        {
          label: 'Tokens',
          value: summary.totalTokens,
          ...delta(summary.totalTokens, summary.prevTotalTokens),
          icon: <Coins className="h-4 w-4" />,
          formatValue: formatCompactNumber,
        },
        {
          label: 'Active days',
          value: summary.activeDays,
          ...delta(summary.activeDays, summary.prevActiveDays),
          icon: <CalendarDays className="h-4 w-4" />,
        },
        {
          label: 'Sessions',
          value: summary.totalSessions,
          ...delta(summary.totalSessions, summary.prevTotalSessions),
          icon: <Users className="h-4 w-4" />,
        },
        {
          label: 'Messages',
          value: summary.totalMessages,
          ...delta(summary.totalMessages, summary.prevTotalMessages),
          icon: <MessageSquare className="h-4 w-4" />,
        },
        {
          label: 'Calls',
          value: summary.totalCalls,
          ...delta(summary.totalCalls, summary.prevTotalCalls),
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
        <ChartCard
          title="YTD cost"
          description={`Estimated cost for ${year} based on model pricing`}
        >
          <CostChart data={costSeries} className="min-h-[260px] max-h-[400px] w-full" />
        </ChartCard>
      )}
    </div>
  )
}
