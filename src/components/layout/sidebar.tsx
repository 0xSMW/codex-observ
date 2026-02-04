'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  Calendar,
  Cpu,
  FolderGit2,
  Gauge,
  GitBranch,
  MessageSquare,
  RefreshCw,
  TerminalSquare,
  Workflow,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

import { Button } from '@/components/ui/button'
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { NAV_ITEMS } from '@/lib/constants'
import { useLiveUpdates } from '@/hooks/use-live-updates'
import { useSyncStatus } from '@/hooks/use-sync-status'
import { useDesktopLogStatus } from '@/hooks/use-desktop-log-status'
import { ThemeToggle } from '@/components/layout/theme-toggle'

const iconMap = {
  Gauge,
  FolderGit2,
  GitBranch,
  MessageSquare,
  TerminalSquare,
  Cpu,
  Calendar,
  Workflow,
}

export function Sidebar() {
  const pathname = usePathname()
  const { status } = useLiveUpdates()
  const { lastSyncedAt, triggerSync, isSyncing } = useSyncStatus()
  const { data: desktopLogStatus } = useDesktopLogStatus()

  const hasDesktopLogs = desktopLogStatus?.hasLogs ?? false
  const visibleNavItems = hasDesktopLogs
    ? NAV_ITEMS
    : NAV_ITEMS.filter((item) => item.href !== '/worktrees' && item.href !== '/automations')

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
    <ShadcnSidebar collapsible="icon">
      <SidebarHeader className="p-4 group-data-[collapsible=icon]:!p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              asChild
              className="md:h-8 md:p-0 hover:bg-transparent cursor-default"
            >
              <div className="flex w-full items-center gap-2">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Activity className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight text-sidebar-foreground group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-semibold">Codex Observe</span>
                  <span className="truncate text-xs text-sidebar-foreground/70">
                    Local insights
                  </span>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {visibleNavItems.map((item) => {
              const Icon = iconMap[item.icon as keyof typeof iconMap]
              const active = pathname === item.href
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                    <Link href={item.href}>
                      <Icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-0">
        <div className="hidden group-data-[state=expanded]:block">
          <div className="border-t border-sidebar-border px-4 py-3">
            <p className="mb-2 text-xs uppercase tracking-wide text-sidebar-foreground/60">Theme</p>
            <ThemeToggle />
          </div>
          <div className="space-y-3 p-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-sidebar-foreground/60">
                Connection
              </p>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <span className={cn('h-2 w-2 rounded-full', statusColor)} />
                {connectionLabel}
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-sidebar-foreground/60">
                Last synced
              </p>
              <div className="mt-1 flex items-center gap-1.5">
                <p className="text-sm">
                  {lastSyncedDate ? formatDistanceToNow(lastSyncedDate, { addSuffix: true }) : '—'}
                </p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-sidebar-foreground/60 hover:text-sidebar-foreground"
                      onClick={() => void triggerSync()}
                      disabled={isSyncing}
                      aria-label="Sync data"
                    >
                      <RefreshCw
                        className={cn('h-3.5 w-3.5', isSyncing && 'animate-spin')}
                        aria-hidden
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{isSyncing ? 'Syncing…' : 'Sync data'}</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </ShadcnSidebar>
  )
}
