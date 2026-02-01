'use client'

import { createContext, useContext, useMemo, useState } from 'react'

type HeaderTitleContextValue = {
  title: string | null
  description: string | null
  setTitle: (title: string | null) => void
  setDescription: (description: string | null) => void
}

const HeaderTitleContext = createContext<HeaderTitleContextValue | undefined>(undefined)

export function HeaderTitleProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = useState<string | null>(null)
  const [description, setDescription] = useState<string | null>(null)

  const value = useMemo(
    () => ({
      title,
      description,
      setTitle,
      setDescription,
    }),
    [title, description]
  )

  return <HeaderTitleContext.Provider value={value}>{children}</HeaderTitleContext.Provider>
}

export function useHeaderTitle() {
  const context = useContext(HeaderTitleContext)
  if (!context) {
    throw new Error('useHeaderTitle must be used within HeaderTitleProvider')
  }
  return context
}
