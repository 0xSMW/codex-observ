'use client'

import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { HeaderTitleProvider } from '@/components/layout/header-title-context'
import { DateRangeProvider } from '@/hooks/use-date-range'
import { LiveUpdatesProvider } from '@/hooks/use-live-updates-context'
import { ProjectFilterProvider } from '@/hooks/use-project-filter'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <HeaderTitleProvider>
      <LiveUpdatesProvider>
        <DateRangeProvider>
          <ProjectFilterProvider>
            <SidebarProvider>
              <Sidebar />
              <SidebarInset>
                <Header />
                <main className="mx-auto w-full max-w-screen-2xl flex-1 overflow-y-auto px-4 pb-12 pt-6 sm:px-6 lg:px-8">
                  {children}
                </main>
              </SidebarInset>
            </SidebarProvider>
          </ProjectFilterProvider>
        </DateRangeProvider>
      </LiveUpdatesProvider>
    </HeaderTitleProvider>
  )
}
