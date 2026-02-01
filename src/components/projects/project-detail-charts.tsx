'use client'

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { formatCompactNumber, formatCurrency, formatNumber } from '@/lib/constants'
import { DailyProjectStat, ModelBreakdown } from '@/lib/metrics/projects'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart'

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
]

interface ProjectHistoryChartProps {
  data: DailyProjectStat[]
}

export function ProjectHistoryChart({ data }: ProjectHistoryChartProps) {
  if (!data || data.length === 0) return null

  const chartConfig = {
    value: { label: 'Sessions', color: 'hsl(var(--chart-1))' },
  } satisfies Parameters<typeof ChartContainer>[0]['config']

  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Sessions Over Time</CardTitle>
        <CardDescription>Daily session activity</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
          <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="#888888"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              tickFormatter={(val) =>
                new Date(val).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
              }
            />
            <YAxis
              stroke="#888888"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => formatCompactNumber(val)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent labelFormatter={(val) => new Date(val).toLocaleDateString()} />
              }
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--color-value)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

interface ProjectTokenBreakdownProps {
  data: ModelBreakdown[]
}

export function ProjectTokenBreakdown({ data }: ProjectTokenBreakdownProps) {
  if (!data || data.length === 0) return null

  // Sort by cost desc
  const sortedData = [...data].sort((a, b) => b.cost - a.cost)

  // Config mapping for dynamic models?
  // We can just use the colors directly or build config dynamically
  // For shadcn charts, we usually define config.
  const chartConfig = sortedData.reduce(
    (acc, curr, index) => {
      acc[curr.model.replace(/\./g, '_')] = {
        label: curr.model,
        color: COLORS[index % COLORS.length],
      }
      return acc
    },
    {} as Record<string, { label: string; color: string }>
  )

  // We need to map data 'fill' property for Pie chart or use Cell
  const chartData = sortedData.map((d, i) => ({
    ...d,
    fill: COLORS[i % COLORS.length],
  }))

  return (
    <Card className="col-span-1">
      <CardHeader>
        <CardTitle className="text-base">Cost by Model</CardTitle>
        <CardDescription>Estimated cost breakdown</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={chartConfig}
          className="min-h-[300px] w-full mx-auto aspect-square max-h-[300px]"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent formatter={(value) => formatCurrency(Number(value))} />}
            />
            <Pie data={chartData} dataKey="cost" nameKey="model" innerRadius={60} strokeWidth={5}>
              {/* Cells handled by fill in data or mapping */}
            </Pie>
            <ChartLegend
              content={<ChartLegendContent nameKey="model" />}
              className="-translate-y-2 flex-wrap gap-2 [&>*]:basis-1/4 [&>*]:justify-center"
            />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export function ProjectTokenUsageChart({ data }: ProjectTokenBreakdownProps) {
  if (!data || data.length === 0) return null

  const sortedData = [...data].sort((a, b) => b.tokens - a.tokens)

  const chartConfig = {
    tokens: { label: 'Tokens', color: 'hsl(var(--chart-2))' },
  } satisfies Parameters<typeof ChartContainer>[0]['config']

  return (
    <Card className="col-span-1">
      <CardHeader>
        <CardTitle className="text-base">Tokens by Model</CardTitle>
        <CardDescription>Token usage breakdown</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
          <BarChart
            data={sortedData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="model"
              stroke="#888888"
              fontSize={11}
              width={100}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => (val.length > 15 ? val.substring(0, 15) + '...' : val)}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent formatter={(value) => formatCompactNumber(Number(value))} />
              }
            />
            <Bar dataKey="tokens" fill="var(--color-tokens)" radius={[0, 4, 4, 0]} barSize={20} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
