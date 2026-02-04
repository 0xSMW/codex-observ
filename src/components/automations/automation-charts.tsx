'use client'

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { formatCompactNumber } from '@/lib/constants'
import type { AutomationSeriesPoint } from '@/types/api'

const runsConfig = {
  queued: { label: 'Queued', color: 'var(--chart-1)' },
  completed: { label: 'Completed', color: 'var(--chart-2)' },
  failed: { label: 'Failed', color: 'var(--chart-5)' },
} satisfies Parameters<typeof ChartContainer>[0]['config']

const backlogConfig = {
  backlog: { label: 'Backlog', color: 'var(--chart-3)' },
} satisfies Parameters<typeof ChartContainer>[0]['config']

export function AutomationRunsChart({ data }: { data: AutomationSeriesPoint[] }) {
  return (
    <ChartContainer config={runsConfig} className="min-h-[260px] w-full">
      <BarChart data={data}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => formatCompactNumber(Number(value))}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="queued" fill="var(--color-queued)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="completed" fill="var(--color-completed)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="failed" fill="var(--color-failed)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}

export function AutomationBacklogChart({ data }: { data: AutomationSeriesPoint[] }) {
  return (
    <ChartContainer config={backlogConfig} className="min-h-[260px] w-full">
      <AreaChart data={data}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => formatCompactNumber(Number(value))}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area
          type="monotone"
          dataKey="backlog"
          stroke="var(--color-backlog)"
          fill="var(--color-backlog)"
          fillOpacity={0.2}
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  )
}
