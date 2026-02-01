'use client'

import { useState } from 'react'
import Link from 'next/link'
import { 
  ChevronLeft, 
  ChevronRight, 
  FolderGit2, 
  MessageSquare, 
  Cpu, 
  DollarSign, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown 
} from 'lucide-react'

import { useDateRange } from '@/hooks/use-date-range'
import { useProjects } from '@/hooks/use-projects'
import { formatCompactNumber, formatPercent, formatCurrency } from '@/lib/constants'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { ErrorState } from '@/components/shared/error-state'
import { EmptyState } from '@/components/shared/empty-state'
import { KPIStatCard } from '@/components/shared/kpi-card'
import { ProjectsChart } from '@/components/projects/projects-chart'

const PAGE_SIZE = 20

export default function ProjectsPage() {
  const { range } = useDateRange()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<string>('lastSeen')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const query = {
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    range,
    sortBy,
    sortOrder,
  }

  const { data, error, isLoading, refresh } = useProjects(query)

  // Use aggregates for KPI cards if available, otherwise fallback (though aggregates is standard now)
  const aggregates = data?.aggregates

  const totalPages = data ? Math.ceil(data.pagination.total / PAGE_SIZE) : 1

  const handleSort = (key: string) => {
    if (sortBy === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(key)
      setSortOrder('desc')
    }
  }

  const SortIcon = ({ keyName }: { keyName: string }) => {
    if (sortBy !== keyName) return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground/50" />
    return sortOrder === 'asc' ? (
      <ArrowUp className="ml-2 h-4 w-4" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4" />
    )
  }

  return (
    <div className="space-y-6">
      {aggregates && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KPIStatCard
            title="Total Projects"
            value={formatCompactNumber(aggregates.totalProjects)}
            icon={<FolderGit2 className="h-4 w-4 text-muted-foreground" />}
            description="Active in period"
          />
          <KPIStatCard
            title="Total Sessions"
            value={formatCompactNumber(aggregates.totalSessions)}
            icon={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
          />
          <KPIStatCard
            title="Total Tokens"
            value={formatCompactNumber(aggregates.totalTokens)}
            icon={<Cpu className="h-4 w-4 text-muted-foreground" />}
          />
          <KPIStatCard
            title="Est. Cost"
            value={formatCurrency(aggregates.totalCost)}
            icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
          />
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 lg:flex-row lg:items-center">
        <div className="flex-1">
          <Input
            placeholder="Search by project name or path"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
      </div>

      {data && data.projects.length > 0 && (
         <ProjectsChart projects={data.projects} />
      )}

      {isLoading && !data && <TableSkeleton rows={8} />}

      {error && !data && (
        <ErrorState description="We couldn't load projects. Try refreshing." onRetry={refresh} />
      )}

      {data && data.projects.length === 0 && (
        <EmptyState
          title="No projects yet"
          description="Projects are derived from session workspaces. Run some Codex sessions to see project rollups here."
        />
      )}

      {data && data.projects.length > 0 && (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Button variant="ghost" className="p-0 hover:bg-transparent" onClick={() => handleSort('name')}>
                    Project <SortIcon keyName="name" />
                  </Button>
                </TableHead>
                <TableHead className="text-right">
                   <Button variant="ghost" className="p-0 hover:bg-transparent ml-auto" onClick={() => handleSort('sessionCount')}>
                    Sessions <SortIcon keyName="sessionCount" />
                  </Button>
                </TableHead>
                <TableHead className="text-right">Tool calls</TableHead>
                <TableHead className="text-right">
                  <Button variant="ghost" className="p-0 hover:bg-transparent ml-auto" onClick={() => handleSort('totalTokens')}>
                    Tokens <SortIcon keyName="totalTokens" />
                  </Button>
                </TableHead>
                <TableHead className="text-right">Cache hit</TableHead>
                <TableHead className="text-right">Est. Cost</TableHead>
                <TableHead className="text-right">
                   <Button variant="ghost" className="p-0 hover:bg-transparent ml-auto" onClick={() => handleSort('lastSeen')}>
                    Last Seen <SortIcon keyName="lastSeen" />
                  </Button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.projects.map((project) => (
                <TableRow key={project.id} className="hover:bg-muted/40">
                  <TableCell className="font-medium">
                    <Link href={`/projects/${project.id}`} className="text-primary hover:underline block">
                      {project.name}
                    </Link>
                    {project.rootPath && (
                      <div className="text-xs font-normal text-muted-foreground truncate max-w-[200px]" title={project.rootPath}>
                        {project.rootPath}
                      </div>
                    )}
                    {project.gitRemote && (
                      <div className="text-[10px] text-muted-foreground/70 truncate max-w-[200px]">
                        {project.gitRemote}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompactNumber(project.sessionCount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompactNumber(project.toolCallCount)}
                    <span className="text-xs text-muted-foreground ml-1">
                      ({formatPercent(project.toolSuccessRate, 0)})
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompactNumber(project.totalTokens)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPercent(project.cacheHitRate)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(project.estimatedCost)}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                     {project.lastSeenTs ? new Date(project.lastSeenTs).toLocaleDateString() : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {data && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
