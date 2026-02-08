'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'
import { usePathname } from 'next/navigation'

type ProjectFilterContextValue = {
  project: string | null
  setProject: (project: string | null) => void
  deferProjectsFetch: boolean
  setDeferProjectsFetch: (defer: boolean) => void
}

const ProjectFilterContext = createContext<ProjectFilterContextValue | undefined>(undefined)

const STORAGE_KEY = 'codex-observ:trends-project'

export function ProjectFilterProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [project, setProject] = useState<string | null>(null)
  const [deferProjectsFetch, setDeferProjectsFetch] = useState<boolean>(true)

  useLayoutEffect(() => {
    if (pathname === '/trends') setDeferProjectsFetch(true)
  }, [pathname])

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    const storedProject = stored && stored !== 'all' ? stored : null

    const url = new URL(window.location.href)
    const queryProjectRaw =
      (url.searchParams.get('project') ?? url.searchParams.get('projectId') ?? '').trim() || null
    const queryProject = queryProjectRaw && queryProjectRaw !== 'all' ? queryProjectRaw : null

    setProject(queryProject ?? storedProject)
  }, [])

  useEffect(() => {
    if (project) window.localStorage.setItem(STORAGE_KEY, project)
    else window.localStorage.removeItem(STORAGE_KEY)

    // Keep the Trends URL shareable without using next/navigation's useSearchParams.
    if (window.location.pathname !== '/trends') return
    const url = new URL(window.location.href)
    if (project) {
      url.searchParams.set('project', project)
      url.searchParams.delete('projectId')
    } else {
      url.searchParams.delete('project')
      url.searchParams.delete('projectId')
    }
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }, [project])

  const setProjectValue = useCallback((nextProject: string | null) => {
    setProject(nextProject)
  }, [])

  const setDeferProjectsFetchValue = useCallback((defer: boolean) => {
    setDeferProjectsFetch(defer)
  }, [])

  const value = useMemo(
    () => ({
      project,
      setProject: setProjectValue,
      deferProjectsFetch,
      setDeferProjectsFetch: setDeferProjectsFetchValue,
    }),
    [project, setProjectValue, deferProjectsFetch, setDeferProjectsFetchValue]
  )

  return <ProjectFilterContext.Provider value={value}>{children}</ProjectFilterContext.Provider>
}

export function useProjectFilter() {
  const context = useContext(ProjectFilterContext)
  if (!context) {
    throw new Error('useProjectFilter must be used within ProjectFilterProvider')
  }
  return context
}
