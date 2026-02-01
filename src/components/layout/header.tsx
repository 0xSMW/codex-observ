'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { DateRangePicker } from '@/components/shared/date-range-picker'
import { NAV_ITEMS } from '@/lib/constants'
import { cn } from '@/lib/utils'

export function Header() {
  const pathname = usePathname()
  const current = NAV_ITEMS.find((item) => item.href === pathname)

  return (
    <header className="sticky top-0 z-40 select-none border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex w-full max-w-screen-2xl items-center gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="md:hidden">
                <Menu className="h-4 w-4" />
                <span className="sr-only">Open navigation</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 sm:w-80">
              <SheetHeader>
                <SheetTitle>Codex Observe</SheetTitle>
              </SheetHeader>
              <nav className="mt-4 space-y-1">
                {NAV_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                      pathname === item.href
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent/50'
                    )}
                  >
                    {item.title}
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                  </Link>
                ))}
              </nav>
              <Separator className="my-6" />
              <div className="text-sm text-muted-foreground">
                Observability snapshots update automatically every 30s.
              </div>
            </SheetContent>
          </Sheet>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {current?.title ?? 'Dashboard'}
            </h1>
            {current?.description && (
              <p className="text-sm text-muted-foreground">{current.description}</p>
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {pathname !== '/activity' &&
            pathname !== '/models' &&
            !pathname.startsWith('/sessions/') && (
              <div className="hidden md:block">
                <DateRangePicker />
              </div>
            )}
        </div>
      </div>
    </header>
  )
}
