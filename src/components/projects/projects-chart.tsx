'use client'

import { useState, useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { formatCompactNumber, formatCurrency } from '@/lib/constants'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ProjectListItem } from '@/lib/metrics/projects'
import { formatGitRemoteDisplay } from '@/lib/format-git-remote'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

interface ProjectsChartProps {
  projects: ProjectListItem[]
}

type Metric = 'tokens' | 'sessions' | 'cost'

export function ProjectsChart({ projects }: ProjectsChartProps) {
  const [metric, setMetric] = useState<Metric>('tokens')

  const chartConfig = {
    tokens: { label: 'Tokens', color: 'var(--foreground)' },
    sessions: { label: 'Sessions', color: 'var(--foreground)' },
    cost: { label: 'Est. Cost', color: 'var(--foreground)' },
  } satisfies Parameters<typeof ChartContainer>[0]['config']

  const data = useMemo(() => {
    // Sort by selected metric and take top 10
    const sorted = [...projects]
      .sort((a, b) => {
        switch (metric) {
          case 'tokens':
            return b.totalTokens - a.totalTokens
          case 'sessions':
            return b.sessionCount - a.sessionCount
          case 'cost':
            return b.estimatedCost - a.estimatedCost
          default:
            return 0
        }
      })
      .slice(0, 10)

    return sorted.map((p) => ({
      name: formatGitRemoteDisplay(p.gitRemote) ?? p.name,
      tokens: p.totalTokens,
      sessions: p.sessionCount,
      cost: p.estimatedCost,
    }))
  }, [projects, metric])

  const formatValue = (value: number) => {
    switch (metric) {
      case 'cost':
        return formatCurrency(value)
      default:
        return formatCompactNumber(value)
    }
  }

  const getTitle = () => {
    switch (metric) {
      case 'tokens':
        return 'Top Projects by Token Usage'
      case 'sessions':
        return 'Top Projects by Session Volume'
      case 'cost':
        return 'Top Projects by Estimated Cost'
    }
  }

  if (projects.length === 0) return null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-base font-medium">{getTitle()}</CardTitle>
          <CardDescription>Comparing top 10 projects</CardDescription>
        </div>
        <Select value={metric} onValueChange={(v) => setMetric(v as Metric)}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tokens">Tokens</SelectItem>
            <SelectItem value="sessions">Sessions</SelectItem>
            <SelectItem value="cost">Cost</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="pt-4">
        <ChartContainer config={chartConfig} className="min-h-[300px] max-h-[400px] w-full">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              type="number"
              tickFormatter={formatValue}
              tickLine={false}
              axisLine={false}
              stroke="#888888"
              fontSize={12}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={140}
              stroke="#888888"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar
              dataKey={metric}
              fill={`var(--color-${metric})`}
              radius={[0, 4, 4, 0]}
              barSize={20}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
