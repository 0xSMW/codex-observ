import Link from 'next/link'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '@/components/shared/status-badge'
import { formatCompactNumber, formatDuration } from '@/lib/constants'
import type { SessionListItem } from '@/types/api'

function getProject(cwd: string | null) {
  if (!cwd) return '—'
  const parts = cwd.split('/')
  return parts[parts.length - 1] || cwd
}

function successStatus(rate: number) {
  if (rate >= 0.9) return 'ok'
  if (rate >= 0.7) return 'partial'
  return 'failed'
}

export function SessionsTable({ sessions }: { sessions: SessionListItem[] }) {
  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Session</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Model provider</TableHead>
            <TableHead className="text-right">Messages</TableHead>
            <TableHead className="text-right">Tokens</TableHead>
            <TableHead className="text-right">Duration</TableHead>
            <TableHead className="text-right">Success</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.map((session) => (
            <TableRow key={session.id} className="hover:bg-muted/40">
              <TableCell className="font-medium">
                <Link href={`/sessions/${session.id}`} className="hover:underline">
                  {session.id.slice(0, 10)}
                </Link>
              </TableCell>
              <TableCell>
                <div className="text-sm font-medium">{getProject(session.cwd)}</div>
                <div className="text-xs text-muted-foreground">{session.cwd ?? '—'}</div>
              </TableCell>
              <TableCell>
                <div className="text-sm">{session.modelProvider ?? '—'}</div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCompactNumber(session.messageCount)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCompactNumber(session.tokens.total)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatDuration(session.durationMs === null ? Number.NaN : session.durationMs)}
              </TableCell>
              <TableCell className="text-right">
                <StatusBadge status={successStatus(session.successRate)} />
              </TableCell>
            </TableRow>
          ))}
          {sessions.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                No sessions found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
