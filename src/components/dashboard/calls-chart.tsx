"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { formatCompactNumber } from "@/lib/constants"
import type { OverviewSeriesPoint } from "@/types/api"

const chartConfig = {
  modelCalls: { label: "Model calls", color: "hsl(var(--chart-2))" },
} satisfies Parameters<typeof ChartContainer>[0]["config"]

export function CallsChart({ data }: { data: OverviewSeriesPoint[] }) {
  return (
    <ChartContainer config={chartConfig} className="min-h-[260px] w-full">
      <BarChart data={data}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => formatCompactNumber(Number(value))}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar
          dataKey="modelCalls"
          fill="var(--color-modelCalls)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  )
}
