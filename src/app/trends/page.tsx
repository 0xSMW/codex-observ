'use client'

import { Clock, Cpu, DollarSign, Gauge, Layers, TerminalSquare, Zap } from 'lucide-react'

import { useDateRange } from '@/hooks/use-date-range'
import { useOverview } from '@/hooks/use-overview'
import { ChartCard } from '@/components/dashboard/chart-card'
import { KpiGrid } from '@/components/dashboard/kpi-grid'
import { TokensChart } from '@/components/dashboard/tokens-chart'
import { CacheChart } from '@/components/dashboard/cache-chart'
import { CallsChart } from '@/components/dashboard/calls-chart'
import { CostChart } from '@/components/dashboard/cost-chart'
import { KpiSkeleton } from '@/components/shared/loading-skeleton'
import { ErrorState } from '@/components/shared/error-state'
import { EmptyState } from '@/components/shared/empty-state'

function getTrend(delta: number | null): 'neutral' | 'up' | 'down' {
  if (delta === null) return 'neutral'
  if (delta > 0) return 'up'
  if (delta < 0) return 'down'
  return 'neutral'
}

export default function TrendsPage() {
  const { range } = useDateRange()
  const { data, error, isLoading, isFallback, refresh } = useOverview(range)

  const series = data?.series?.daily ?? []
  const kpis = data?.kpis

  const kpiItems = kpis
    ? [
        {
          label: 'Total tokens',
          value: kpis.totalTokens.value,
          change: kpis.totalTokens.deltaPct ?? 0,
          trend: getTrend(kpis.totalTokens.delta),
          icon: <Layers className="h-4 w-4" />,
        },
        {
          label: 'Cache hit rate',
          value: kpis.cacheHitRate.value,
          change: kpis.cacheHitRate.deltaPct ?? 0,
          trend: getTrend(kpis.cacheHitRate.delta),
          icon: <Zap className="h-4 w-4" />,
          isPercent: true,
        },
        {
          label: 'Sessions',
          value: kpis.sessions.value,
          change: kpis.sessions.deltaPct ?? 0,
          trend: getTrend(kpis.sessions.delta),
          icon: <Gauge className="h-4 w-4" />,
        },
        {
          label: 'Model calls',
          value: kpis.modelCalls.value,
          change: kpis.modelCalls.deltaPct ?? 0,
          trend: getTrend(kpis.modelCalls.delta),
          icon: <Cpu className="h-4 w-4" />,
        },
        {
          label: 'Tool calls',
          value: kpis.toolCalls.value,
          change: kpis.toolCalls.deltaPct ?? 0,
          trend: getTrend(kpis.toolCalls.delta),
          icon: <TerminalSquare className="h-4 w-4" />,
        },
        {
          label: 'Tool success rate',
          value: kpis.successRate.value,
          change: kpis.successRate.deltaPct ?? 0,
          trend: getTrend(kpis.successRate.delta),
          icon: <TerminalSquare className="h-4 w-4" />,
          isPercent: true,
        },
        {
          label: 'Usage cost',
          value: kpis.totalCost.value,
          change: kpis.totalCost.deltaPct ?? 0,
          trend: getTrend(kpis.totalCost.delta),
          icon: <DollarSign className="h-4 w-4" />,
          formatValue: (v: number) => (Number.isFinite(v) && v > 0 ? `$${v.toFixed(2)}` : '—'),
        },
        {
          label: 'Avg model latency',
          value: Number(kpis.avgModelDurationMs?.value) || 0,
          change: kpis.avgModelDurationMs?.deltaPct ?? 0,
          trend: getTrend(kpis.avgModelDurationMs?.delta ?? null),
          icon: <Clock className="h-4 w-4" />,
          formatValue: (v: number) => (Number.isFinite(v) ? `${Math.round(v)}ms` : '—'),
        },
        {
          label: 'Avg tool latency',
          value: Number(kpis.avgToolDurationMs?.value) || 0,
          change: kpis.avgToolDurationMs?.deltaPct ?? 0,
          trend: getTrend(kpis.avgToolDurationMs?.delta ?? null),
          icon: <Clock className="h-4 w-4" />,
          formatValue: (v: number) => (Number.isFinite(v) ? `${Math.round(v)}ms` : '—'),
        },
      ]
    : []

  return (
    <div className="space-y-6">
      {isFallback && (
        <div className="rounded-lg border border-dashed bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          Showing sample data while the local Codex data ingests.
        </div>
      )}

      {isLoading && !data && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <KpiSkeleton key={index} />
          ))}
        </div>
      )}

      {error && !data && (
        <ErrorState
          description="We couldn't load overview metrics. Try refreshing."
          onRetry={refresh}
        />
      )}

      {data && (
        <>
          <KpiGrid items={kpiItems} />

          {series.length === 0 ? (
            <EmptyState
              title="No activity yet"
              description="Once Codex sessions are ingested, charts will appear here."
            />
          ) : (
            <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
              <ChartCard
                title="Token throughput"
                description="Input, cached input, and output tokens"
              >
                <TokensChart data={series} />
              </ChartCard>
              <ChartCard
                title="Cache utilization"
                description="Percent of input tokens served from cache"
              >
                <CacheChart data={series} />
              </ChartCard>
              <ChartCard title="Daily cost" description="Cost for period based on model pricing">
                <CostChart data={series} />
              </ChartCard>
              <ChartCard title="Model calls" description="Total model invocations per day">
                <CallsChart data={series} />
              </ChartCard>
            </div>
          )}
        </>
      )}

      {isLoading && data && (
        <div className="rounded-lg border border-dashed bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          Refreshing metrics…
        </div>
      )}
    </div>
  )
}
