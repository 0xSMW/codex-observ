'use client'

import { usePathname } from 'next/navigation'

import { SidebarTrigger } from '@/components/ui/sidebar'
import { DateRangePicker } from '@/components/shared/date-range-picker'
import { NAV_ITEMS } from '@/lib/constants'
import { useHeaderTitle } from '@/components/layout/header-title-context'

function getRouteFallback(pathname: string): { title: string; description?: string } | null {
  if (/^\/projects\/[^/]+$/.test(pathname))
    return { title: 'Project', description: 'Project detail' }
  return null
}

export function Header() {
  const pathname = usePathname()
  const { title, description } = useHeaderTitle()
  if (pathname === '/') return null
  const current = NAV_ITEMS.find((item) => item.href === pathname)
  const routeFallback = getRouteFallback(pathname)

  const headerTitle = title ?? routeFallback?.title ?? current?.title ?? 'Dashboard'
  const headerDescription = description ?? routeFallback?.description ?? current?.description

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
          {pathname !== '/' && pathname !== '/models' && !pathname.startsWith('/sessions/') && (
            <div className="hidden md:block">
              <DateRangePicker />
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
