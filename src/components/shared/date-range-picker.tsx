"use client"

import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useDateRange } from "@/hooks/use-date-range"
import { cn } from "@/lib/utils"

export function DateRangePicker() {
  const { range, setRange } = useDateRange()

  const label = range?.from
    ? range.to
      ? `${format(range.from, "LLL dd, y")} – ${format(range.to, "LLL dd, y")}`
      : format(range.from, "LLL dd, y")
    : "Pick a date"

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "min-w-[220px] justify-start text-left font-normal",
            !range?.from && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="range"
          numberOfMonths={2}
          selected={range}
          onSelect={(next) => {
            if (next) {
              setRange(next)
            }
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  )
}
