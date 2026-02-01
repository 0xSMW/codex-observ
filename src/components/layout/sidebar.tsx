'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  Activity,
  Calendar,
  Cpu,
  FolderGit2,
  Gauge,
  MessageSquare,
  PanelLeft,
  TerminalSquare,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from '@/lib/constants'
import { useLiveUpdates } from '@/hooks/use-live-updates'
import { useSyncStatus } from '@/hooks/use-sync-status'

const iconMap = {
  Gauge,
  FolderGit2,
  MessageSquare,
  TerminalSquare,
  Cpu,
  Calendar,
}

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('sidebar-collapsed') === 'true'
  })
  const { status } = useLiveUpdates()
  const { lastSyncedAt } = useSyncStatus()

  const handleToggle = () => {
    const next = !collapsed
    setCollapsed(next)
    window.localStorage.setItem('sidebar-collapsed', String(next))
  }

  const lastSyncedDate = lastSyncedAt ? new Date(lastSyncedAt) : null
  const connectionLabel =
    status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting' : 'Disconnected'
  const statusColor =
    status === 'connected'
      ? 'bg-emerald-500'
      : status === 'connecting'
        ? 'bg-amber-500'
        : 'bg-rose-500'

  return (
    <aside
      className={cn(
        'bg-sidebar text-sidebar-foreground border-r border-sidebar-border sticky top-0 z-10 hidden h-screen shrink-0 flex-col self-start md:flex',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Activity className="h-4 w-4" aria-hidden />
          </div>
          {!collapsed && (
            <div>
              <p className="text-sm font-semibold">Codex Observe</p>
              <p className="text-xs text-sidebar-foreground/70">Local insights</p>
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggle}
          className="hidden md:inline-flex"
        >
          <PanelLeft className="h-4 w-4" />
          <span className="sr-only">Toggle sidebar</span>
        </Button>
      </div>

      <nav className="flex-1 space-y-1 px-2">
        {NAV_ITEMS.map((item) => {
          const Icon = iconMap[item.icon as keyof typeof iconMap]
          const active = pathname === item.href
          const link = (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/80 hover:bg-sidebar-accent/60'
              )}
            >
              <Icon className="h-4 w-4" />
              {!collapsed && <span>{item.title}</span>}
            </Link>
          )

          if (collapsed) {
            return (
              <Tooltip key={item.href} delayDuration={0}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.title}</TooltipContent>
              </Tooltip>
            )
          }

          return link
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className={cn('space-y-3', collapsed && 'hidden')}>
          <div>
            <p className="text-xs uppercase tracking-wide text-sidebar-foreground/60">Connection</p>
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className={cn('h-2 w-2 rounded-full', statusColor)} />
              {connectionLabel}
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-sidebar-foreground/60">
              Last synced
            </p>
            <p className="mt-1 text-sm">
              {lastSyncedDate ? formatDistanceToNow(lastSyncedDate, { addSuffix: true }) : '—'}
            </p>
          </div>
        </div>
      </div>
    </aside>
  )
}
