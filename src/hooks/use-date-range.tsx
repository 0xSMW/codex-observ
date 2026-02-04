'use client'

import React, { createContext, useContext, useMemo, useState } from 'react'
import { addDays, endOfDay, startOfDay, subDays } from 'date-fns'
import type { DateRange } from 'react-day-picker'

export type DateRangeContextValue = {
  range: DateRange
  setRange: (range: DateRange) => void
}

const DateRangeContext = createContext<DateRangeContextValue | undefined>(undefined)

const defaultRange: DateRange = {
  from: startOfDay(subDays(new Date(), 29)),
  to: endOfDay(new Date()),
}

function normalizeRange(next: DateRange): DateRange {
  const nextFrom = next?.from ? startOfDay(next.from) : undefined
  const nextTo = next?.to ? endOfDay(next.to) : undefined

  if (nextFrom && nextTo && nextFrom > nextTo) {
    return {
      from: startOfDay(next.to ?? nextFrom),
      to: endOfDay(next.from ?? nextTo),
    }
  }

  if (!nextFrom && nextTo) {
    return {
      from: startOfDay(addDays(nextTo, -29)),
      to: nextTo,
    }
  }

  return { from: nextFrom, to: nextTo }
}

export function DateRangeProvider({ children }: { children: React.ReactNode }) {
  const [range, setRange] = useState<DateRange>(defaultRange)

  const value = useMemo(
    () => ({
      range,
      setRange: (next: DateRange) => {
        setRange(normalizeRange(next))
      },
    }),
    [range]
  )

  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>
}

export function useDateRange() {
  const context = useContext(DateRangeContext)
  if (!context) {
    throw new Error('useDateRange must be used within DateRangeProvider')
  }
  return context
}
