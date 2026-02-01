'use client'

import Link from 'next/link'
import { ColumnDef } from '@tanstack/react-table'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

import type { ProjectListItem } from '@/types/api'
import { formatCompactNumber, formatPercent, formatCurrency } from '@/lib/constants'
import { Button } from '@/components/ui/button'
export function createProjectColumns(sortState: {
  sortBy: string
  sortOrder: 'asc' | 'desc'
  onSort: (key: string) => void
}): ColumnDef<ProjectListItem>[] {
  const SortIcon = ({ columnId }: { columnId: string }) => {
    if (sortState.sortBy !== columnId) {
      return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground/50" />
    }
    return sortState.sortOrder === 'asc' ? (
      <ArrowUp className="ml-2 h-4 w-4" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4" />
    )
  }

  return [
    {
      accessorKey: 'name',
      header: () => (
        <Button
          variant="ghost"
          className="p-0 hover:bg-transparent"
          onClick={() => sortState.onSort('name')}
        >
          Project <SortIcon columnId="name" />
        </Button>
      ),
      cell: ({ row }) => {
        const project = row.original
        return (
          <div>
            <Link
              href={`/projects/${project.id}`}
              className="text-primary hover:underline block font-medium"
            >
              {project.name}
            </Link>
            {project.rootPath && (
              <div
                className="text-xs font-normal text-muted-foreground max-w-[200px]"
                title={project.rootPath}
              >
                {project.rootPath}
              </div>
            )}
            {project.gitRemote && (
              <div className="text-[10px] text-muted-foreground/70 max-w-[200px]">
                {project.gitRemote}
              </div>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: 'sessionCount',
      header: () => (
        <div className="text-right">
          <Button
            variant="ghost"
            className="p-0 hover:bg-transparent ml-auto"
            onClick={() => sortState.onSort('sessionCount')}
          >
            Sessions <SortIcon columnId="sessionCount" />
          </Button>
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-right tabular-nums">
          {formatCompactNumber(row.original.sessionCount)}
        </div>
      ),
    },
    {
      accessorKey: 'toolCallCount',
      header: () => <div className="text-right">Tool calls</div>,
      cell: ({ row }) => (
        <div className="text-right tabular-nums">
          {formatCompactNumber(row.original.toolCallCount)}
          <span className="text-xs text-muted-foreground ml-1">
            ({formatPercent(row.original.toolSuccessRate, 0)})
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'totalTokens',
      header: () => (
        <div className="text-right">
          <Button
            variant="ghost"
            className="p-0 hover:bg-transparent ml-auto"
            onClick={() => sortState.onSort('totalTokens')}
          >
            Tokens <SortIcon columnId="totalTokens" />
          </Button>
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-right tabular-nums">
          {formatCompactNumber(row.original.totalTokens)}
        </div>
      ),
    },
    {
      accessorKey: 'cacheHitRate',
      header: () => <div className="text-right">Cache hit</div>,
      cell: ({ row }) => (
        <div className="text-right tabular-nums">{formatPercent(row.original.cacheHitRate)}</div>
      ),
    },
    {
      accessorKey: 'estimatedCost',
      header: () => <div className="text-right">Est. Cost</div>,
      cell: ({ row }) => (
        <div className="text-right tabular-nums">{formatCurrency(row.original.estimatedCost)}</div>
      ),
    },
    {
      accessorKey: 'lastSeenTs',
      header: () => (
        <div className="text-right">
          <Button
            variant="ghost"
            className="p-0 hover:bg-transparent ml-auto"
            onClick={() => sortState.onSort('lastSeen')}
          >
            Last Seen <SortIcon columnId="lastSeen" />
          </Button>
        </div>
      ),
      cell: ({ row }) => (
        <div className="text-right text-xs text-muted-foreground whitespace-nowrap">
          {row.original.lastSeenTs ? new Date(row.original.lastSeenTs).toLocaleDateString() : '—'}
        </div>
      ),
    },
  ]
}
