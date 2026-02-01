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
import { useEffect } from 'react'
import { useDateRange } from '@/hooks/use-date-range'
import { useApiData } from '@/hooks/use-api'
import { useHeaderTitle } from '@/components/layout/header-title-context'
import { formatCompactNumber, formatPercent, formatCurrency } from '@/lib/constants'
import { formatGitRemoteDisplay } from '@/lib/format-git-remote'
import { KpiSkeleton } from '@/components/shared/loading-skeleton'
import { ErrorState } from '@/components/shared/error-state'
import { FolderGit2, GitBranch, GitCommit, ExternalLink } from 'lucide-react'
import {
  ProjectHistoryChart,
  ProjectTokenBreakdown,
  ProjectTokenUsageChart,
} from '@/components/projects/project-detail-charts'
import { DailyProjectStat, ModelBreakdown } from '@/lib/metrics/projects'

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
    estimatedCost: number
  }
  branches: Array<{ branch: string | null; commit: string | null; sessionCount: number }>
  history: DailyProjectStat[]
  tokenBreakdown: ModelBreakdown[]
}

export default function ProjectDetailPage() {
  const params = useParams()
  const id = typeof params?.id === 'string' ? params.id : ''
  const { range } = useDateRange()
  const { setTitle, setDescription } = useHeaderTitle()

  const paramsStr =
    range?.from && range?.to
      ? `?startDate=${range.from.toISOString()}&endDate=${range.to.toISOString()}`
      : ''
  const url = id ? `/api/projects/${encodeURIComponent(id)}${paramsStr}` : null

  const { data, error, isLoading, refresh } = useApiData<ProjectDetailResponse>(url)

  useEffect(() => {
    if (!data?.project) return
    const displayTitle = formatGitRemoteDisplay(data.project.gitRemote) ?? data.project.name
    setTitle(displayTitle)
    setDescription('Project detail')
    return () => {
      setTitle(null)
      setDescription(null)
    }
  }, [data?.project, data?.project?.gitRemote, data?.project?.name, setTitle, setDescription])

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

  const { project, branches, history, tokenBreakdown } = data

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/projects" className="text-primary hover:underline">
          Projects
        </Link>
        <span>/</span>
        <span className="text-foreground">
          {formatGitRemoteDisplay(project.gitRemote) ?? project.name}
        </span>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-xl flex items-center gap-2">
                <FolderGit2 className="h-5 w-5 text-muted-foreground" />
                {formatGitRemoteDisplay(project.gitRemote) ?? project.name}
              </CardTitle>
              {project.rootPath && (
                <p className="text-sm text-muted-foreground font-normal font-mono break-all">
                  {project.rootPath}
                </p>
              )}
            </div>
            {project.gitRemote && (
              <a
                href={project.gitRemote}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1 hover:underline"
              >
                {project.gitRemote.replace(/^https?:\/\//, '')}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="text-xs uppercase text-muted-foreground mb-1">Sessions</div>
            <div className="text-2xl font-bold tabular-nums">
              {formatCompactNumber(project.sessionCount)}
            </div>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="text-xs uppercase text-muted-foreground mb-1">Tokens</div>
            <div className="text-2xl font-bold tabular-nums">
              {formatCompactNumber(project.totalTokens)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {formatPercent(project.cacheHitRate)} cache hit
            </div>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="text-xs uppercase text-muted-foreground mb-1">Est. Cost</div>
            <div className="text-2xl font-bold tabular-nums">
              {formatCurrency(project.estimatedCost)}
            </div>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="text-xs uppercase text-muted-foreground mb-1">Tool Success</div>
            <div className="text-2xl font-bold tabular-nums">
              {formatPercent(project.toolSuccessRate)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {formatCompactNumber(project.toolCallCount)} calls
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {history && history.length > 0 && (
          <div className="lg:col-span-2">
            <ProjectHistoryChart data={history} />
          </div>
        )}
        {tokenBreakdown && tokenBreakdown.length > 0 && (
          <>
            <ProjectTokenBreakdown data={tokenBreakdown} />
            <ProjectTokenUsageChart data={tokenBreakdown} />
          </>
        )}
      </div>

      {branches.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              Branches & Worktrees
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead>Latest Commit</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches
                  .slice()
                  .sort((a, b) => b.sessionCount - a.sessionCount)
                  .map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{row.branch ?? '—'}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground flex items-center gap-1">
                        {row.commit ? <GitCommit className="h-3 w-3" /> : null}
                        {row.commit ? row.commit.substring(0, 7) : '—'}
                      </TableCell>
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
