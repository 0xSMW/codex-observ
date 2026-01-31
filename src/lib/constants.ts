import { addDays, eachDayOfInterval, endOfYear, format, startOfYear, subDays } from "date-fns"

import type {
  OverviewResponse,
  SessionsResponse,
  SessionDetailResponse,
  ModelsResponse,
  ToolCallsResponse,
  ActivityResponse,
  ProvidersResponse,
} from "@/types/api"

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

const PROJECTS = [
  "codex-observ",
  "cli-ingest",
  "docs-sync",
  "frontend-ux",
  "tooling-lab",
]
const MODELS = [
  "gpt-5-codex",
  "gpt-4.2",
  "gpt-4o-mini",
  "gpt-4.1",
]
const PROVIDERS = ["openai", "azure", "local"]

function defaultRange(days = 29) {
  const today = new Date()
  return {
    start: subDays(today, days).toISOString(),
    end: today.toISOString(),
    startMs: subDays(today, days).getTime(),
    endMs: today.getTime(),
  }
}

export function buildMockOverviewResponse(): OverviewResponse {
  const today = new Date()
  const days = eachDayOfInterval({ start: subDays(today, 29), end: today })

  const daily = days.map((day, index) => {
    const inputTokens = Math.round(95000 + index * 2100 + (index % 5) * 1800)
    const cachedInputTokens = Math.round(inputTokens * (0.22 + ((index % 6) * 0.02)))
    const outputTokens = Math.round(64000 + index * 1700 + (index % 4) * 1400)
    const reasoningTokens = Math.round(7200 + (index % 4) * 800)
    const totalTokens = inputTokens + outputTokens + reasoningTokens
    const modelCalls = Math.round(160 + index * 2 + (index % 5) * 8)
    const cacheHitRate = inputTokens > 0 ? cachedInputTokens / inputTokens : 0

    return {
      date: format(day, "MMM d"),
      inputTokens,
      cachedInputTokens,
      outputTokens,
      reasoningTokens,
      totalTokens,
      modelCalls,
      cacheHitRate,
    }
  })

  return {
    range: defaultRange(),
    kpis: {
      totalTokens: { value: 4_823_129, previous: 4_290_552, delta: 532_577, deltaPct: 0.124 },
      cacheHitRate: { value: 0.42, previous: 0.39, delta: 0.03, deltaPct: 0.077 },
      sessions: { value: 286, previous: 294, delta: -8, deltaPct: -0.027 },
      modelCalls: { value: 4_912, previous: 4_602, delta: 310, deltaPct: 0.067 },
      toolCalls: { value: 1_842, previous: 1_701, delta: 141, deltaPct: 0.083 },
      successRate: { value: 0.93, previous: 0.92, delta: 0.01, deltaPct: 0.011 },
      avgModelDurationMs: { value: 18_200, previous: 19_100, delta: -900, deltaPct: -0.047 },
      avgToolDurationMs: { value: 1_420, previous: 1_510, delta: -90, deltaPct: -0.06 },
    },
    series: { daily },
  }
}

export function buildMockSessions(count = 48): SessionsResponse {
  const now = new Date()
  const sessions = Array.from({ length: count }).map((_, index) => {
    const startedAt = subDays(now, Math.floor(index / 3))
    const durationMs = 120000 + (index % 7) * 22000
    const inputTokens = 9800 + index * 240
    const cachedInputTokens = Math.round(inputTokens * 0.28)
    const outputTokens = 8400 + index * 210
    const reasoningTokens = 1200 + (index % 4) * 80
    const totalTokens = inputTokens + outputTokens + reasoningTokens
    return {
      id: `sess-${1000 + index}`,
      ts: startedAt.getTime(),
      cwd: `/Users/stephenwalker/Code/${PROJECTS[index % PROJECTS.length]}`,
      originator: "local",
      cliVersion: "1.0.0",
      modelProvider: PROVIDERS[index % PROVIDERS.length],
      gitBranch: "main",
      gitCommit: "abc123f",
      messageCount: 12 + (index % 5) * 3,
      modelCallCount: 6 + (index % 4),
      toolCallCount: 3 + (index % 3),
      tokens: {
        input: inputTokens,
        cachedInput: cachedInputTokens,
        output: outputTokens,
        reasoning: reasoningTokens,
        total: totalTokens,
        cacheHitRate: cachedInputTokens / inputTokens,
      },
      avgModelDurationMs: 18_000 + (index % 5) * 1200,
      avgToolDurationMs: 1200 + (index % 5) * 120,
      successRate: 0.85 + (index % 5) * 0.03,
      durationMs,
    }
  })

  return {
    range: defaultRange(),
    filters: { search: null, models: [], providers: [] },
    pagination: {
      limit: count,
      offset: 0,
      total: 312,
      page: 1,
      pageSize: count,
    },
    sessions,
  }
}

export function buildMockSessionDetail(id: string): SessionDetailResponse {
  const startedAt = subDays(new Date(), 3)
  const inputTokens = 6200
  const cachedInputTokens = 1800
  const outputTokens = 8400
  const reasoningTokens = 1100
  const totalTokens = inputTokens + outputTokens + reasoningTokens

  return {
    range: defaultRange(),
    session: {
      id,
      ts: startedAt.getTime(),
      cwd: "/Users/stephenwalker/Code/codex-observ",
      originator: "local",
      cliVersion: "1.0.0",
      modelProvider: "openai",
      gitBranch: "main",
      gitCommit: "abc123f",
      sourceFile: "rollout-0001.jsonl",
      sourceLine: 12,
    },
    stats: {
      messageCount: 14,
      modelCallCount: 6,
      toolCallCount: 4,
      tokens: {
        input: inputTokens,
        cachedInput: cachedInputTokens,
        output: outputTokens,
        reasoning: reasoningTokens,
        total: totalTokens,
        cacheHitRate: cachedInputTokens / inputTokens,
      },
      avgModelDurationMs: 21400,
      avgToolDurationMs: 1100,
      successRate: 0.9,
      durationMs: 162000,
    },
    messages: {
      pagination: { limit: 25, offset: 0, total: 3, page: 1, pageSize: 25 },
      items: [
        {
          id: `${id}-m1`,
          role: "user",
          content: "Add activity heatmap and compare cache hit rate.",
          ts: startedAt.getTime(),
        },
        {
          id: `${id}-m2`,
          role: "assistant",
          content: "Drafting the heatmap layout, then updating cache charts.",
          ts: addDays(startedAt, 0).getTime(),
        },
        {
          id: `${id}-m3`,
          role: "assistant",
          content: "Heatmap complete. Starting cache summary cards and labels.",
          ts: addDays(startedAt, 0).getTime(),
        },
      ],
    },
    modelCalls: {
      pagination: { limit: 25, offset: 0, total: 6, page: 1, pageSize: 25 },
      items: Array.from({ length: 6 }).map((_, index) => ({
        id: `${id}-call-${index + 1}`,
        ts: addDays(startedAt, 0).getTime(),
        model: MODELS[index % MODELS.length],
        inputTokens: 420 + index * 80,
        cachedInputTokens: 120 + index * 20,
        outputTokens: 680 + index * 140,
        reasoningTokens: 90 + index * 15,
        totalTokens: 1310 + index * 255,
        durationMs: 21000 + index * 2600,
      })),
    },
    toolCalls: {
      pagination: { limit: 25, offset: 0, total: 3, page: 1, pageSize: 25 },
      items: [
        {
          id: `${id}-tool-1`,
          toolName: "exec_command",
          status: "ok",
          durationMs: 1280,
          command: "rg -n \"api\" src",
          startTs: startedAt.getTime(),
          endTs: addDays(startedAt, 0).getTime(),
          exitCode: 0,
          error: null,
          stdoutBytes: 340,
          stderrBytes: 0,
          correlationKey: "tool-1",
        },
        {
          id: `${id}-tool-2`,
          toolName: "apply_patch",
          status: "ok",
          durationMs: 980,
          command: "apply_patch ...",
          startTs: startedAt.getTime(),
          endTs: addDays(startedAt, 0).getTime(),
          exitCode: 0,
          error: null,
          stdoutBytes: 120,
          stderrBytes: 0,
          correlationKey: "tool-2",
        },
        {
          id: `${id}-tool-3`,
          toolName: "exec_command",
          status: "failed",
          durationMs: 2140,
          command: "pnpm lint",
          startTs: startedAt.getTime(),
          endTs: addDays(startedAt, 0).getTime(),
          exitCode: 1,
          error: "Lint failed",
          stdoutBytes: 200,
          stderrBytes: 120,
          correlationKey: "tool-3",
        },
      ],
    },
  }
}

export function buildMockModels(): ModelsResponse {
  return {
    range: defaultRange(),
    pagination: { limit: 25, offset: 0, total: MODELS.length, page: 1, pageSize: 25 },
    models: MODELS.map((model, index) => {
      const inputTokens = 140000 + index * 32000
      const cachedInputTokens = Math.round(inputTokens * 0.32)
      const outputTokens = 98000 + index * 18000
      const reasoningTokens = 14000 + index * 2400
      return {
        model,
        callCount: 820 + index * 120,
        tokens: {
          input: inputTokens,
          cachedInput: cachedInputTokens,
          output: outputTokens,
          reasoning: reasoningTokens,
          total: inputTokens + outputTokens + reasoningTokens,
          cacheHitRate: cachedInputTokens / inputTokens,
        },
        avgDurationMs: 18200 + index * 2100,
      }
    }),
  }
}

export function buildMockProviders(): ProvidersResponse {
  return {
    range: defaultRange(),
    pagination: { limit: 25, offset: 0, total: PROVIDERS.length, page: 1, pageSize: 25 },
    providers: PROVIDERS.map((provider, index) => {
      const inputTokens = 220000 + index * 52000
      const cachedInputTokens = Math.round(inputTokens * 0.28)
      const outputTokens = 180000 + index * 36000
      const reasoningTokens = 24000 + index * 3600
      return {
        provider,
        sessionCount: 120 + index * 20,
        modelCallCount: 820 + index * 120,
        tokens: {
          input: inputTokens,
          cachedInput: cachedInputTokens,
          output: outputTokens,
          reasoning: reasoningTokens,
          total: inputTokens + outputTokens + reasoningTokens,
          cacheHitRate: cachedInputTokens / inputTokens,
        },
        avgModelDurationMs: 19100 + index * 900,
      }
    }),
  }
}

export function buildMockToolCalls(): ToolCallsResponse {
  return {
    range: defaultRange(),
    filters: { status: [], tools: [], sessionId: null, search: null },
    pagination: { limit: 25, offset: 0, total: 6, page: 1, pageSize: 25 },
    summary: {
      total: 1280,
      ok: 1190,
      failed: 68,
      unknown: 22,
      avgDurationMs: 1240,
      successRate: 0.93,
    },
    toolCalls: [
      {
        id: "tool-1",
        sessionId: "sess-1201",
        toolName: "exec_command",
        command: "rg -n \"overview\" src",
        status: "ok",
        startTs: Date.now() - 86000,
        endTs: Date.now() - 84000,
        durationMs: 1200,
        exitCode: 0,
        error: null,
        stdoutBytes: 680,
        stderrBytes: 0,
        correlationKey: "exec-1",
      },
      {
        id: "tool-2",
        sessionId: "sess-1201",
        toolName: "apply_patch",
        command: "apply_patch ...",
        status: "ok",
        startTs: Date.now() - 74000,
        endTs: Date.now() - 72000,
        durationMs: 980,
        exitCode: 0,
        error: null,
        stdoutBytes: 420,
        stderrBytes: 0,
        correlationKey: "patch-2",
      },
      {
        id: "tool-3",
        sessionId: "sess-1198",
        toolName: "exec_command",
        command: "pnpm lint",
        status: "failed",
        startTs: Date.now() - 62000,
        endTs: Date.now() - 60000,
        durationMs: 2140,
        exitCode: 1,
        error: "Lint failed on src/components",
        stdoutBytes: 120,
        stderrBytes: 240,
        correlationKey: "exec-3",
      },
    ],
  }
}

export function buildMockActivity(year: number): ActivityResponse {
  const start = startOfYear(new Date(year, 0, 1))
  const end = endOfYear(new Date(year, 0, 1))
  const days = eachDayOfInterval({ start, end })

  const activity = days.map((day, index) => {
    const messageCount = index % 6 === 0 ? 0 : 12 + (index % 5) * 8
    const callCount = index % 6 === 0 ? 0 : 6 + (index % 7) * 4
    const tokenTotal = messageCount === 0 ? 0 : 18000 + (index % 8) * 2400
    return {
      date: format(day, "yyyy-MM-dd"),
      messageCount,
      callCount,
      tokenTotal,
    }
  })

  const summary = activity.reduce(
    (acc, day) => {
      acc.totalMessages += day.messageCount
      acc.totalCalls += day.callCount
      acc.totalTokens += day.tokenTotal
      if (day.messageCount || day.callCount || day.tokenTotal) {
        acc.activeDays += 1
      }
      return acc
    },
    { totalMessages: 0, totalCalls: 0, totalTokens: 0, activeDays: 0 }
  )

  return {
    range: {
      start: start.toISOString(),
      end: end.toISOString(),
      startMs: start.getTime(),
      endMs: end.getTime(),
    },
    activity,
    summary,
  }
}
