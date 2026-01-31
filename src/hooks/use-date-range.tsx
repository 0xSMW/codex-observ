"use client"

import React, { createContext, useContext, useMemo, useState } from "react"
import { addDays, startOfDay, subDays } from "date-fns"
import type { DateRange } from "react-day-picker"

export type DateRangeContextValue = {
  range: DateRange
  setRange: (range: DateRange) => void
}

const DateRangeContext = createContext<DateRangeContextValue | undefined>(
  undefined
)

const defaultRange: DateRange = {
  from: startOfDay(subDays(new Date(), 29)),
  to: startOfDay(new Date()),
}

export function DateRangeProvider({ children }: { children: React.ReactNode }) {
  const [range, setRange] = useState<DateRange>(defaultRange)

  const value = useMemo(
    () => ({
      range,
      setRange: (next: DateRange) => {
        if (next?.from && next?.to && next.from > next.to) {
          setRange({ from: next.to, to: next.from })
          return
        }
        if (!next?.from && next?.to) {
          setRange({ from: addDays(next.to, -29), to: next.to })
          return
        }
        setRange(next)
      },
    }),
    [range]
  )

  return (
    <DateRangeContext.Provider value={value}>
      {children}
    </DateRangeContext.Provider>
  )
}

export function useDateRange() {
  const context = useContext(DateRangeContext)
  if (!context) {
    throw new Error("useDateRange must be used within DateRangeProvider")
  }
  return context
}
