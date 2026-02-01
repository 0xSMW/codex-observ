'use client'

import { Clock, Cpu, DollarSign, MessageSquare } from 'lucide-react'

import { KPIStatCard } from '@/components/shared/kpi-card'
import { formatCompactNumber, formatCost, formatDuration } from '@/lib/constants'
import type { SessionMediansSummary } from '@/types/api'

export function SessionsMediansTiles({ summary }: { summary: SessionMediansSummary }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <KPIStatCard
        title="Median Calls"
        value={formatCompactNumber(summary.medianCalls)}
        icon={<MessageSquare className="h-4 w-4" />}
      />
      <KPIStatCard
        title="Median Tokens"
        value={formatCompactNumber(summary.medianTokens)}
        icon={<Cpu className="h-4 w-4" />}
      />
      <KPIStatCard
        title="Median Cost"
        value={formatCost(summary.medianCost)}
        icon={<DollarSign className="h-4 w-4" />}
      />
      <KPIStatCard
        title="Median Duration"
        value={formatDuration(summary.medianDurationMs)}
        icon={<Clock className="h-4 w-4" />}
      />
    </div>
  )
}
