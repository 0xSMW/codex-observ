export type NavItem = {
  title: string
  href: string
  icon: string
  description?: string
}

export const NAV_ITEMS: NavItem[] = [
  { title: "Overview", href: "/", icon: "Gauge", description: "KPIs and trends" },
  { title: "Sessions", href: "/sessions", icon: "MessageSquare", description: "Session history" },
  { title: "Tools", href: "/tools", icon: "TerminalSquare", description: "Tool call analytics" },
  { title: "Models", href: "/models", icon: "Cpu", description: "Models & providers" },
  { title: "Activity", href: "/activity", icon: "Calendar", description: "Daily activity" },
]

export const CHART_COLORS = {
  tokens: "var(--chart-1)",
  calls: "var(--chart-2)",
  cache: "var(--chart-3)",
  success: "var(--chart-4)",
  failure: "var(--chart-5)",
}

const numberFormatter = new Intl.NumberFormat("en-US")
const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
})

export function formatNumber(value: number) {
  return numberFormatter.format(value)
}

export function formatCompactNumber(value: number) {
  return compactFormatter.format(value)
}

export function formatPercent(value: number, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`
}

export function formatDuration(ms: number) {
  if (!Number.isFinite(ms)) return "—"
  if (ms < 1000) return `${Math.round(ms)}ms`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  return `${hours}h`
}
