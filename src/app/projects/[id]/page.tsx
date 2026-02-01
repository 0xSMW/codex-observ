'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useDateRange } from '@/hooks/use-date-range'
import { useApiData } from '@/hooks/use-api'
import { formatCompactNumber, formatPercent } from '@/lib/constants'
import { KpiSkeleton } from '@/components/shared/loading-skeleton'
import { ErrorState } from '@/components/shared/error-state'

type ProjectDetailResponse = {
  range?: { start: string | null; end: string | null }
  project: {
    id: string
    name: string
    rootPath: string | null
    gitRemote: string | null
    sessionCount: number
    toolCallCount: number
    totalTokens: number
    cacheHitRate: number
    toolSuccessRate: number
  }
  branches: Array<{ branch: string | null; commit: string | null; sessionCount: number }>
}

export default function ProjectDetailPage() {
  const params = useParams()
  const id = typeof params?.id === 'string' ? params.id : ''
  const { range } = useDateRange()

  const paramsStr =
    range?.from && range?.to
      ? `?startDate=${range.from.toISOString()}&endDate=${range.to.toISOString()}`
      : ''
  const url = id ? `/api/projects/${encodeURIComponent(id)}${paramsStr}` : null

  const { data, error, isLoading, refresh } = useApiData<ProjectDetailResponse>(url)

  if (!id) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Invalid project ID.
        </CardContent>
      </Card>
    )
  }

  if (isLoading && !data) {
    return (
      <div className="space-y-6">
        <KpiSkeleton />
        <KpiSkeleton />
      </div>
    )
  }

  if (error && !data) {
    return (
      <ErrorState description="We couldn't load this project. Try refreshing." onRetry={refresh} />
    )
  }

  if (!data?.project) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Project not found.
        </CardContent>
      </Card>
    )
  }

  const { project, branches } = data

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/projects" className="text-primary hover:underline">
          Projects
        </Link>
        <span>/</span>
        <span className="text-foreground">{project.name}</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{project.name}</CardTitle>
          {project.rootPath && (
            <p className="text-sm text-muted-foreground font-normal">{project.rootPath}</p>
          )}
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1 text-sm">
            <div className="text-xs uppercase text-muted-foreground">Sessions</div>
            <div className="font-semibold tabular-nums">
              {formatCompactNumber(project.sessionCount)}
            </div>
          </div>
          <div className="space-y-1 text-sm">
            <div className="text-xs uppercase text-muted-foreground">Tool calls</div>
            <div className="font-semibold tabular-nums">
              {formatCompactNumber(project.toolCallCount)}
            </div>
          </div>
          <div className="space-y-1 text-sm">
            <div className="text-xs uppercase text-muted-foreground">Total tokens</div>
            <div className="font-semibold tabular-nums">
              {formatCompactNumber(project.totalTokens)}
            </div>
          </div>
          <div className="space-y-1 text-sm">
            <div className="text-xs uppercase text-muted-foreground">Cache hit / Tool success</div>
            <div className="font-semibold tabular-nums">
              {formatPercent(project.cacheHitRate)} / {formatPercent(project.toolSuccessRate)}
            </div>
          </div>
        </CardContent>
      </Card>

      {branches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Branches / worktrees</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead>Commit</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>{row.branch ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{row.commit ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCompactNumber(row.sessionCount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
