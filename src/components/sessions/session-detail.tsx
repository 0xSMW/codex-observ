import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '@/components/shared/status-badge'
import { formatCompactNumber, formatDuration, formatPercent } from '@/lib/constants'
import type { SessionDetailResponse } from '@/types/api'

function successStatus(rate: number, toolCallCount: number) {
  if (toolCallCount === 0) return 'ok' // No tools run = nothing to fail
  if (rate >= 0.9) return 'ok'
  if (rate >= 0.7) return 'partial'
  return 'failed'
}

export function SessionDetail({ data }: { data: SessionDetailResponse }) {
  if (!data.session || !data.stats) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Session not found.
        </CardContent>
      </Card>
    )
  }

  const { session, stats } = data

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Session overview</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1 text-sm">
            <div className="text-xs uppercase text-muted-foreground">Session ID</div>
            <div className="font-medium">{session.id}</div>
          </div>
          <div className="space-y-1 text-sm">
            <div className="text-xs uppercase text-muted-foreground">Workspace</div>
            <div className="font-medium">{session.cwd ?? '—'}</div>
          </div>
          <div className="space-y-1 text-sm">
            <div className="text-xs uppercase text-muted-foreground">Provider</div>
            <div className="font-medium">{session.modelProvider ?? '—'}</div>
          </div>
          <div className="space-y-1 text-sm">
            <div className="text-xs uppercase text-muted-foreground">Originator</div>
            <div className="font-medium">{session.originator ?? '—'}</div>
          </div>
          <div className="space-y-1 text-sm">
            <div className="text-xs uppercase text-muted-foreground">CLI version</div>
            <div className="font-medium">{session.cliVersion ?? '—'}</div>
          </div>
          <div className="space-y-1 text-sm">
            <div className="text-xs uppercase text-muted-foreground">Git</div>
            <div className="font-medium">
              {session.gitBranch ?? '—'} {session.gitCommit ? `· ${session.gitCommit}` : ''}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Total tokens</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {formatCompactNumber(stats.tokens.total)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Cache hit rate</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {formatPercent(stats.tokens.cacheHitRate)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Model calls</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {formatCompactNumber(stats.modelCallCount)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tool success</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-2xl font-semibold tabular-nums">
            {stats.toolCallCount === 0 ? '—' : formatPercent(stats.successRate)}
            <StatusBadge status={successStatus(stats.successRate, stats.toolCallCount)} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Model calls</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Input</TableHead>
                <TableHead className="text-right">Cached</TableHead>
                <TableHead className="text-right">Output</TableHead>
                <TableHead className="text-right">Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.modelCalls.items.map((call) => (
                <TableRow key={call.id}>
                  <TableCell>{call.model ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompactNumber(call.inputTokens)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompactNumber(call.cachedInputTokens)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCompactNumber(call.outputTokens)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDuration(call.durationMs === null ? Number.NaN : call.durationMs)}
                  </TableCell>
                </TableRow>
              ))}
              {data.modelCalls.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    No model calls recorded.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tool calls</CardTitle>
        </CardHeader>
        <CardContent>
          <Table className="table-fixed w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Tool</TableHead>
                <TableHead className="min-w-0 max-w-[280px]">Command</TableHead>
                <TableHead className="text-right w-14">Exit</TableHead>
                <TableHead className="text-right">Status</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead className="max-w-[180px]">Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.toolCalls.items.map((call) => (
                <TableRow key={call.id}>
                  <TableCell className="font-medium">{call.toolName}</TableCell>
                  <TableCell
                    className="min-w-0 max-w-[280px] truncate text-xs text-muted-foreground"
                    title={call.command ?? undefined}
                  >
                    <span className="block truncate">{call.command ?? '—'}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {call.exitCode !== null ? call.exitCode : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <StatusBadge status={call.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDuration(call.durationMs === null ? Number.NaN : call.durationMs)}
                  </TableCell>
                  <TableCell
                    className="max-w-[180px] truncate text-xs text-muted-foreground"
                    title={call.error ?? undefined}
                  >
                    {call.error ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
              {data.toolCalls.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    No tool calls recorded.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Messages</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.messages.items.map((message) => (
            <div key={message.id} className="rounded-lg border px-4 py-3">
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span className="uppercase">{message.role}</span>
                <span>{new Date(message.ts).toLocaleString()}</span>
              </div>
              <p className="text-sm">{message.content ?? '—'}</p>
            </div>
          ))}
          {data.messages.items.length === 0 && (
            <div className="text-center text-sm text-muted-foreground">No messages recorded.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
