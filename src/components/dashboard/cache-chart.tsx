"use client"

import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { formatPercent } from "@/lib/constants"
import type { OverviewSeriesPoint } from "@/types/api"

const chartConfig = {
  cacheHitRate: { label: "Cache hit rate", color: "hsl(var(--chart-3))" },
} satisfies Parameters<typeof ChartContainer>[0]["config"]

export function CacheChart({ data }: { data: OverviewSeriesPoint[] }) {
  return (
    <ChartContainer config={chartConfig} className="min-h-[260px] w-full">
      <LineChart data={data}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} />
        <YAxis
          tickLine={false}
          axisLine={false}
          domain={[0, 1]}
          tickFormatter={(value) => formatPercent(Number(value), 0)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => formatPercent(Number(value), 1)}
            />
          }
        />
        <Line
          type="monotone"
          dataKey="cacheHitRate"
          stroke="var(--color-cacheHitRate)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  )
}
