'use client'

import { Cpu, Layers, DollarSign, MessageSquare, Clock } from 'lucide-react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorState } from '@/components/shared/error-state'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { KPIStatCard } from '@/components/shared/kpi-card'
import { useModels } from '@/hooks/use-models'
import { useProviders } from '@/hooks/use-providers'
import { formatCompactNumber, formatCost, formatDuration, formatPercent, formatCurrency } from '@/lib/constants'
import { ModelsCostChart, ModelsTokenChart } from '@/components/models/models-charts'

export default function ModelsPage() {
  const {
    data: modelsData,
    error: modelsError,
    isLoading: modelsLoading,
    refresh: refreshModels,
  } = useModels()
  const {
    data: providersData,
    error: providersError,
    isLoading: providersLoading,
    refresh: refreshProviders,
  } = useProviders()

  const aggregates = modelsData?.aggregates

  return (
    <Tabs defaultValue="models" className="space-y-6">
      <TabsList>
        <TabsTrigger value="models">Models</TabsTrigger>
        <TabsTrigger value="providers">Providers</TabsTrigger>
      </TabsList>

      <TabsContent value="models" className="space-y-6">
        {aggregates && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
             <KPIStatCard
              title="Total Calls"
              value={formatCompactNumber(aggregates.totalCalls)}
              icon={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
            />
            <KPIStatCard
              title="Total Tokens"
              value={formatCompactNumber(aggregates.totalTokens)}
              icon={<Cpu className="h-4 w-4 text-muted-foreground" />}
            />
            <KPIStatCard
              title="Est. Total Cost"
              value={formatCurrency(aggregates.totalCost)}
              icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
            />
            <KPIStatCard
              title="Avg. Duration"
              value={formatDuration(aggregates.avgDurationMs)}
              icon={<Clock className="h-4 w-4 text-muted-foreground" />}
            />
          </div>
        )}
        
        {modelsData && modelsData.models.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2">
            <ModelsCostChart models={modelsData.models} />
            <ModelsTokenChart models={modelsData.models} />
          </div>
        )}

        {modelsLoading && !modelsData && <TableSkeleton rows={6} />}
        {modelsError && !modelsData && (
          <ErrorState
            description="We couldn’t load model usage. Try refreshing."
            onRetry={refreshModels}
          />
        )}
        {modelsData && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Model usage</CardTitle>
              <Cpu className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Total tokens</TableHead>
                    <TableHead className="text-right">Reasoning</TableHead>
                    <TableHead className="text-right">Est. cost</TableHead>
                    <TableHead className="text-right">Cache hit</TableHead>
                    <TableHead className="text-right">Avg duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {modelsData.models.map((model) => (
                    <TableRow key={model.model}>
                      <TableCell className="font-medium">{model.model}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCompactNumber(model.callCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCompactNumber(model.tokens.total)}
                      </TableCell>
                       <TableCell className="text-right tabular-nums text-muted-foreground">
                        {model.tokens.reasoning > 0 ? formatCompactNumber(model.tokens.reasoning) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCost(model.estimatedCost)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercent(model.tokens.cacheHitRate)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDuration(model.avgDurationMs)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {modelsData.models.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        No model calls recorded.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="providers" className="space-y-6">
        {providersLoading && !providersData && <TableSkeleton rows={6} />}
        {providersError && !providersData && (
          <ErrorState
            description="We couldn’t load provider usage. Try refreshing."
            onRetry={refreshProviders}
          />
        )}
        {providersData && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Provider breakdown</CardTitle>
              <Layers className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead className="text-right">Sessions</TableHead>
                    <TableHead className="text-right">Model calls</TableHead>
                    <TableHead className="text-right">Total tokens</TableHead>
                    <TableHead className="text-right">Cache hit</TableHead>
                    <TableHead className="text-right">Avg Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providersData.providers.map((provider) => (
                    <TableRow key={provider.provider}>
                      <TableCell className="font-medium">{provider.provider}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCompactNumber(provider.sessionCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCompactNumber(provider.modelCallCount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCompactNumber(provider.tokens.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercent(provider.tokens.cacheHitRate)}
                      </TableCell>
                       <TableCell className="text-right tabular-nums">
                        {formatDuration(provider.avgModelDurationMs)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {providersData.providers.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        No provider activity recorded.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </TabsContent>
    </Tabs>
  )
}
