'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { formatCost } from '@/lib/constants'
import type { OverviewSeriesPoint } from '@/types/api'

const chartConfig = {
  estimatedCost: { label: 'Est. cost', color: 'var(--foreground)' },
} satisfies Parameters<typeof ChartContainer>[0]['config']

function formatAxisCost(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '$0'
  return `$${value.toFixed(2)}`
}

export function CostChart({ data }: { data: OverviewSeriesPoint[] }) {
  return (
    <ChartContainer config={chartConfig} className="min-h-[260px] w-full">
      <BarChart data={data}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => formatAxisCost(Number(value))}
        />
        <ChartTooltip
          content={<ChartTooltipContent formatter={(value) => formatCost(Number(value))} />}
        />
        <Bar dataKey="estimatedCost" fill="var(--color-estimatedCost)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
