"use client"

import { addDays, differenceInCalendarDays, endOfYear, format, startOfWeek, startOfYear } from "date-fns"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ActivityResponse } from "@/types/api"
import { formatCompactNumber } from "@/lib/constants"
import { cn } from "@/lib/utils"

const LEVELS = [
  "bg-muted/40",
  "bg-emerald-200/70 dark:bg-emerald-900/40",
  "bg-emerald-300/80 dark:bg-emerald-800/60",
  "bg-emerald-400/90 dark:bg-emerald-700/70",
  "bg-emerald-500 dark:bg-emerald-600",
]

export function ActivityHeatmap({
  year,
  data,
}: {
  year: number
  data: ActivityResponse
}) {
  const start = startOfYear(new Date(year, 0, 1))
  const end = endOfYear(new Date(year, 0, 1))
  const startGrid = startOfWeek(start, { weekStartsOn: 0 })
  const totalDays = differenceInCalendarDays(end, startGrid) + 1
  const cells = Array.from({ length: totalDays }).map((_, index) =>
    addDays(startGrid, index)
  )

  const map = new Map<string, number>()
  data.activity.forEach((day) => {
    const value = day.tokenTotal
    map.set(day.date, value)
  })

  const max = Math.max(...data.activity.map((day) => day.tokenTotal), 0)

  const getLevel = (value: number) => {
    if (value <= 0 || max === 0) return 0
    const ratio = value / max
    return Math.min(4, Math.max(1, Math.ceil(ratio * 4)))
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-flow-col grid-rows-7 gap-1">
        {cells.map((date) => {
          const key = format(date, "yyyy-MM-dd")
          const value = map.get(key) ?? 0
          const level = getLevel(value)
          const isCurrentYear = date.getFullYear() === year
          return (
            <Tooltip key={key} delayDuration={0}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "h-3 w-3 rounded-[3px]",
                    LEVELS[level],
                    !isCurrentYear && "opacity-30"
                  )}
                />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <div className="font-medium">{format(date, "MMM d, yyyy")}</div>
                <div className="text-muted-foreground">
                  {formatCompactNumber(value)} tokens
                </div>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Less</span>
        {LEVELS.map((className, index) => (
          <span key={index} className={cn("h-2.5 w-2.5 rounded-[3px]", className)} />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}
