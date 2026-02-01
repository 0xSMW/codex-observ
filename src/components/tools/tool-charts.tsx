'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { formatCompactNumber, formatPercent } from '@/lib/constants'
import { ToolBreakdown, FailureBreakdown } from '@/types/api'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

interface ToolUsageChartProps {
  data: ToolBreakdown[]
}

export function ToolUsageChart({ data }: ToolUsageChartProps) {
  if (!data || data.length === 0) return null

  const chartConfig = {
    count: { label: 'Calls', color: 'hsl(var(--chart-1))' },
  } satisfies Parameters<typeof ChartContainer>[0]['config']

  const chartData = [...data].sort((a, b) => b.count - a.count).slice(0, 10)

  return (
    <Card className="col-span-1">
      <CardHeader>
        <CardTitle className="text-base">Top Tools</CardTitle>
        <CardDescription>Most frequently used tools</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="tool"
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
            <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} barSize={20} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

interface FailureChartProps {
  data: FailureBreakdown[]
}

export function ToolFailureChart({ data }: FailureChartProps) {
  if (!data || data.length === 0) return null

  const chartConfig = {
    count: { label: 'Errors', color: 'hsl(var(--chart-5))' },
  } satisfies Parameters<typeof ChartContainer>[0]['config']

  const chartData = [...data].sort((a, b) => b.count - a.count).slice(0, 10)

  return (
    <Card className="col-span-1">
      <CardHeader>
        <CardTitle className="text-base">Top Errors</CardTitle>
        <CardDescription>Most frequent error messages</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="error"
              stroke="#888888"
              fontSize={11}
              width={150}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => (val.length > 20 ? val.substring(0, 20) + '...' : val)}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent formatter={(value) => formatCompactNumber(Number(value))} />
              }
            />
            <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} barSize={20} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
