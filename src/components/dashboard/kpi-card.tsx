import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'

import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCompactNumber, formatPercent } from '@/lib/constants'
import { cn } from '@/lib/utils'

export type KpiCardProps = {
  label: string
  value: number
  change: number
  trend: 'up' | 'down' | 'neutral'
  icon?: React.ReactNode
  isPercent?: boolean
  formatValue?: (value: number) => string
}

export function KpiCard({
  label,
  value,
  change,
  trend,
  icon,
  isPercent = false,
  formatValue,
}: KpiCardProps) {
  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus
  const trendColor =
    trend === 'up'
      ? 'text-emerald-600 dark:text-emerald-400'
      : trend === 'down'
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-muted-foreground'

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <CardAction className="text-muted-foreground">{icon}</CardAction>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">
          {formatValue
            ? formatValue(value)
            : isPercent
              ? formatPercent(value)
              : formatCompactNumber(value)}
        </div>
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <TrendIcon className={cn('h-3.5 w-3.5', trendColor)} />
          <span className={cn('font-medium', trendColor)}>{formatPercent(change, 1)}</span>
          <span>vs last period</span>
        </p>
      </CardContent>
    </Card>
  )
}
