"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useLiveUpdates } from "@/hooks/use-live-updates"

type LiveStatus = "connecting" | "connected" | "disconnected"

interface LiveUpdatesContextValue {
  status: LiveStatus
  lastUpdate: Date | null
}

const LiveUpdatesContext = createContext<LiveUpdatesContextValue | null>(null)

export function LiveUpdatesProvider({ children }: { children: ReactNode }) {
  const { status, lastUpdate } = useLiveUpdates()
  
  return (
    <LiveUpdatesContext.Provider value={{ status, lastUpdate }}>
      {children}
    </LiveUpdatesContext.Provider>
  )
}

export function useLiveUpdatesContext(): LiveUpdatesContextValue {
  const context = useContext(LiveUpdatesContext)
  if (!context) {
    // Return default values if used outside provider (shouldn't happen with proper setup)
    return { status: "disconnected", lastUpdate: null }
  }
  return context
}
