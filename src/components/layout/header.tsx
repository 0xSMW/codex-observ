'use client'

import { useMemo } from 'react'
import { usePathname } from 'next/navigation'

import { SidebarTrigger } from '@/components/ui/sidebar'
import { DateRangePicker } from '@/components/shared/date-range-picker'
import { useDateRange } from '@/hooks/use-date-range'
import { useProjects } from '@/hooks/use-projects'
import { useProjectFilter } from '@/hooks/use-project-filter'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { NAV_ITEMS } from '@/lib/constants'
import { useHeaderTitle } from '@/components/layout/header-title-context'

function getRouteFallback(pathname: string): { title: string; description?: string } | null {
  if (/^\/projects\/[^/]+$/.test(pathname))
    return { title: 'Project', description: 'Project detail' }
  return null
}

export function Header() {
  const pathname = usePathname()
  const { range } = useDateRange()
  const { project, setProject, deferProjectsFetch } = useProjectFilter()
  const { title, description } = useHeaderTitle()
  if (pathname === '/') return null
  const current = NAV_ITEMS.find((item) => item.href === pathname)
  const routeFallback = getRouteFallback(pathname)

  const headerTitle = title ?? routeFallback?.title ?? current?.title ?? 'Dashboard'
  const headerDescription = description ?? routeFallback?.description ?? current?.description
  const showDateRange =
    pathname !== '/' && pathname !== '/ingest' && !pathname.startsWith('/sessions/')
  const showProjectFilter = pathname === '/trends'

  const projectValue = project ?? 'all'
  const { data: projectsData } = useProjects({
    page: 1,
    pageSize: 100,
    range,
    enabled: showProjectFilter && !deferProjectsFetch,
  })
  const projectOptions = useMemo(() => {
    return (projectsData?.projects ?? []).map((p) => ({ id: p.id, name: p.name || p.id }))
  }, [projectsData?.projects])
  const hasSelectedProject =
    projectValue === 'all' || projectOptions.some((project) => project.id === projectValue)

  return (
    <header className="sticky top-0 z-40 select-none border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex w-full max-w-screen-2xl items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{headerTitle}</h1>
            {headerDescription && (
              <p className="text-sm text-muted-foreground">{headerDescription}</p>
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {showProjectFilter && (
            <div className="hidden md:block">
              <Select
                value={projectValue}
                onValueChange={(next) => setProject(next === 'all' ? null : next)}
              >
                <SelectTrigger className="w-[260px]">
                  <SelectValue placeholder="All projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All projects</SelectItem>
                  {!hasSelectedProject && projectValue !== 'all' ? (
                    <SelectItem value={projectValue}>{projectValue}</SelectItem>
                  ) : null}
                  {projectOptions.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showDateRange && (
            <div className="hidden md:block">
              <DateRangePicker />
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
