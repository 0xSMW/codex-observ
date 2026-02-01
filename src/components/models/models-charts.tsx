'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { formatCompactNumber, formatCurrency } from '@/lib/constants'
import { ModelSummary } from '@/types/api'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

interface ModelsChartsProps {
  models: ModelSummary[]
}

export function ModelsCostChart({ models }: ModelsChartsProps) {
  if (!models || models.length === 0) return null

  const chartConfig = {
    cost: { label: 'Cost', color: 'hsl(var(--chart-1))' },
  } satisfies Parameters<typeof ChartContainer>[0]['config']

  // Top 10 by cost
  const data = [...models]
    .filter((m) => (m.estimatedCost ?? 0) > 0)
    .sort((a, b) => (b.estimatedCost ?? 0) - (a.estimatedCost ?? 0))
    .slice(0, 10)
    .map((m) => ({
      name: m.model,
      cost: m.estimatedCost ?? 0,
    }))

  if (data.length === 0) return null

  return (
    <Card className="col-span-1">
      <CardHeader>
        <CardTitle className="text-base">Top Models by Cost</CardTitle>
        <CardDescription>Estimated cost breakdown</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              stroke="#888888"
              fontSize={11}
              width={100}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val) => (val.length > 15 ? val.substring(0, 15) + '...' : val)}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent formatter={(value) => formatCurrency(Number(value))} />}
            />
            <Bar dataKey="cost" fill="var(--color-cost)" radius={[0, 4, 4, 0]} barSize={20} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

export function ModelsTokenChart({ models }: ModelsChartsProps) {
  if (!models || models.length === 0) return null

  const chartConfig = {
    tokens: { label: 'Tokens', color: 'hsl(var(--chart-2))' },
  } satisfies Parameters<typeof ChartContainer>[0]['config']

  // Top 10 by tokens
  const data = [...models]
    .sort((a, b) => b.tokens.total - a.tokens.total)
    .slice(0, 10)
    .map((m) => ({
      name: m.model,
      tokens: m.tokens.total,
    }))

  return (
    <Card className="col-span-1">
      <CardHeader>
        <CardTitle className="text-base">Top Models by Tokens</CardTitle>
        <CardDescription>Total tokens consumed</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
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
