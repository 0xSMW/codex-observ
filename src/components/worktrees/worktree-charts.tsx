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
import type { WorktreeSeriesPoint } from '@/types/api'

const volumeConfig = {
  created: { label: 'Created', color: 'var(--chart-1)' },
  deleted: { label: 'Archived', color: 'var(--chart-2)' },
} satisfies Parameters<typeof ChartContainer>[0]['config']

const activeConfig = {
  active: { label: 'Active', color: 'var(--chart-3)' },
} satisfies Parameters<typeof ChartContainer>[0]['config']

export function WorktreeVolumeChart({ data }: { data: WorktreeSeriesPoint[] }) {
  return (
    <ChartContainer config={volumeConfig} className="min-h-[260px] w-full">
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
        <Bar dataKey="created" fill="var(--color-created)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="deleted" fill="var(--color-deleted)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}

export function WorktreeActiveChart({ data }: { data: WorktreeSeriesPoint[] }) {
  return (
    <ChartContainer config={activeConfig} className="min-h-[260px] w-full">
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
          dataKey="active"
          stroke="var(--color-active)"
          fill="var(--color-active)"
          fillOpacity={0.2}
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  )
}
