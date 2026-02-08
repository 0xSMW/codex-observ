'use client'

import { Line, LineChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatCompactNumber, formatCost, formatDurationSeconds } from '@/lib/constants'
import type { SessionMediansPoint } from '@/types/api'

const metrics = {
  calls: {
    label: 'Median calls',
    dataKey: 'medianCalls',
    format: formatCompactNumber,
  },
  tokens: {
    label: 'Median tokens',
    dataKey: 'medianTokens',
    format: formatCompactNumber,
  },
  cost: {
    label: 'Median cost',
    dataKey: 'medianCost',
    format: formatCost,
  },
  duration: {
    label: 'Median duration',
    dataKey: 'medianDurationMs',
    format: formatDurationSeconds,
  },
}

export function SessionsMediansChart({ data }: { data: SessionMediansPoint[] }) {
  if (!data || data.length === 0) return null

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold">Median session trends</h3>
        <p className="text-sm text-muted-foreground">
          Daily medians for calls, tokens, cost, and duration
        </p>
      </div>
      <Tabs defaultValue="calls" className="mt-4 space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="calls">Calls</TabsTrigger>
          <TabsTrigger value="tokens">Tokens</TabsTrigger>
          <TabsTrigger value="cost">Cost</TabsTrigger>
          <TabsTrigger value="duration">Duration</TabsTrigger>
        </TabsList>
        {Object.entries(metrics).map(([key, metric]) => (
          <TabsContent key={key} value={key} className="mt-0">
            <ChartContainer
              config={{ value: { label: metric.label, color: 'var(--foreground)' } }}
              className="min-h-[260px] w-full"
            >
              <LineChart data={data}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="date" tickLine={false} axisLine={false} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => metric.format(Number(value))}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => metric.format(Number(value))}
                      labelClassName="text-xs"
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey={metric.dataKey}
                  stroke="var(--color-value)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
