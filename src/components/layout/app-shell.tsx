'use client'

import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { DateRangeProvider } from '@/hooks/use-date-range'
import { LiveUpdatesProvider } from '@/hooks/use-live-updates-context'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <LiveUpdatesProvider>
      <DateRangeProvider>
        <div className="flex h-screen overflow-hidden bg-muted/30">
          <Sidebar />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Header />
            <main className="mx-auto w-full max-w-screen-2xl flex-1 overflow-y-auto px-4 pb-12 pt-6 sm:px-6 lg:px-8">
              {children}
            </main>
          </div>
        </div>
      </DateRangeProvider>
    </LiveUpdatesProvider>
  )
}
