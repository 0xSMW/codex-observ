'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { useDateRange } from '@/hooks/use-date-range'
import { useProjects } from '@/hooks/use-projects'
import { formatCompactNumber, formatPercent } from '@/lib/constants'
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

const PAGE_SIZE = 20

export default function ProjectsPage() {
  const { range } = useDateRange()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  const query = {
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    range,
  }

  const { data, error, isLoading, refresh } = useProjects(query)

  const totalPages = data ? Math.ceil(data.pagination.total / PAGE_SIZE) : 1

  return (
    <div className="space-y-6">
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
                <TableHead>Project</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="text-right">Tool calls</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Cache hit</TableHead>
                <TableHead className="text-right">Tool success</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.projects.map((project) => (
                <TableRow key={project.id} className="hover:bg-muted/40">
                  <TableCell className="font-medium">
                    <Link href={`/projects/${project.id}`} className="text-primary hover:underline">
                      {project.name}
                    </Link>
                    {project.rootPath && (
                      <div className="text-xs font-normal text-muted-foreground truncate max-w-[200px]">
                        {project.rootPath}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompactNumber(project.sessionCount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompactNumber(project.toolCallCount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompactNumber(project.totalTokens)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPercent(project.cacheHitRate)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPercent(project.toolSuccessRate)}
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
