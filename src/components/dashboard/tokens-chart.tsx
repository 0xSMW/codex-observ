"use client"

import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts"

import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { formatCompactNumber } from "@/lib/constants"
import type { OverviewSeriesPoint } from "@/types/api"

const chartConfig = {
  inputTokens: { label: "Input", color: "hsl(var(--chart-1))" },
  cachedInputTokens: { label: "Cached", color: "hsl(var(--chart-3))" },
  outputTokens: { label: "Output", color: "hsl(var(--chart-2))" },
} satisfies Parameters<typeof ChartContainer>[0]["config"]

export function TokensChart({ data }: { data: OverviewSeriesPoint[] }) {
  return (
    <ChartContainer config={chartConfig} className="min-h-[260px] w-full">
      <AreaChart data={data}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => formatCompactNumber(Number(value))}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Area
          type="monotone"
          dataKey="inputTokens"
          stroke="var(--color-inputTokens)"
          fill="var(--color-inputTokens)"
          fillOpacity={0.15}
          strokeWidth={2}
        />
        <Area
          type="monotone"
          dataKey="cachedInputTokens"
          stroke="var(--color-cachedInputTokens)"
          fill="var(--color-cachedInputTokens)"
          fillOpacity={0.12}
          strokeWidth={2}
        />
        <Area
          type="monotone"
          dataKey="outputTokens"
          stroke="var(--color-outputTokens)"
          fill="var(--color-outputTokens)"
          fillOpacity={0.12}
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  )
}
