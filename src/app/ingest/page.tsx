'use client'

import { useState } from 'react'
import { AlertTriangle, FileText, RefreshCw } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

import { useIngest } from '@/hooks/use-ingest'
import { KPIStatCard } from '@/components/shared/kpi-card'
import { ErrorState } from '@/components/shared/error-state'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { formatCompactNumber, formatDurationSeconds } from '@/lib/constants'

const PAGE_SIZE = 25

export default function IngestPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  const { data, error, isLoading, refresh } = useIngest({
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
  })

  const lastRunDate = data?.lastRun ? new Date(data.lastRun) : null
  const lastUpdatedAt = data?.summary?.lastUpdatedAt ? new Date(data.summary.lastUpdatedAt) : null
  const errorCount = data?.lastResult?.errors?.length ?? 0
  const durationMs = data?.lastResult?.durationMs ?? Number.NaN

  const totalPages = data?.pagination
    ? Math.max(1, Math.ceil(data.pagination.total / PAGE_SIZE))
    : 1

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPIStatCard
          title="Last ingest"
          value={lastRunDate ? formatDistanceToNow(lastRunDate, { addSuffix: true }) : '—'}
          icon={<RefreshCw className="h-4 w-4 text-muted-foreground" />}
          description={lastRunDate ? lastRunDate.toLocaleString() : undefined}
        />
        <KPIStatCard
          title="Files tracked"
          value={formatCompactNumber(data?.summary?.totalFiles ?? 0)}
          icon={<FileText className="h-4 w-4 text-muted-foreground" />}
          description={
            lastUpdatedAt
              ? `Updated ${formatDistanceToNow(lastUpdatedAt, { addSuffix: true })}`
              : ''
          }
        />
        <KPIStatCard
          title="Last run duration"
          value={formatDurationSeconds(durationMs)}
          icon={<RefreshCw className="h-4 w-4 text-muted-foreground" />}
        />
        <KPIStatCard
          title="Parse errors"
          value={formatCompactNumber(errorCount)}
          icon={<AlertTriangle className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 lg:flex-row lg:items-center">
        <div className="flex-1">
          <Input
            placeholder="Search by file path"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
          />
        </div>
      </div>

      {isLoading && !data && <TableSkeleton rows={8} />}

      {error && !data && (
        <ErrorState
          description="We couldn't load ingest status. Try refreshing."
          onRetry={refresh}
        />
      )}

      {data && (
        <div className="rounded-lg border bg-card">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead>Path</TableHead>
                <TableHead className="text-right w-40">Updated</TableHead>
                <TableHead className="text-right w-28">Offset</TableHead>
                <TableHead className="text-right w-40">Mtime</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.files?.map((item) => (
                <TableRow key={item.path} className="hover:bg-muted/40">
                  <TableCell className="text-xs text-muted-foreground truncate" title={item.path}>
                    {item.path}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {new Date(item.updatedAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompactNumber(item.byteOffset)}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {item.mtimeMs ? new Date(item.mtimeMs).toLocaleString() : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {data.files && data.files.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No ingest files recorded.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {totalPages > 1 && (
            <div className="flex items-center justify-center px-4 py-3 border-t">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      aria-disabled={page <= 1 || isLoading}
                      className={
                        page <= 1 || isLoading ? 'pointer-events-none opacity-50' : 'cursor-pointer'
                      }
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <span className="text-sm text-muted-foreground px-4">
                      Page {page} of {totalPages}
                    </span>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      aria-disabled={page >= totalPages || isLoading}
                      className={
                        page >= totalPages || isLoading
                          ? 'pointer-events-none opacity-50'
                          : 'cursor-pointer'
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
