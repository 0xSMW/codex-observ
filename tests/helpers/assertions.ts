import { expect } from 'vitest'

export function expectKpiShape(kpi: unknown): void {
  expect(kpi).toBeDefined()
  expect(kpi).toHaveProperty('value')
  expect(kpi).toHaveProperty('previous')
  expect(kpi).toHaveProperty('delta')
  expect(kpi).toHaveProperty('deltaPct')
  expect(typeof (kpi as { value: unknown }).value).toBe('number')
}

export function expectOverviewShape(data: unknown): void {
  expect(data).toBeDefined()
  expect(data).toHaveProperty('kpis')
  const kpis = (data as { kpis: Record<string, unknown> }).kpis
  expect(kpis).toHaveProperty('totalTokens')
  expect(kpis).toHaveProperty('cacheHitRate')
  expect(kpis).toHaveProperty('sessions')
  expect(kpis).toHaveProperty('modelCalls')
  expect(kpis).toHaveProperty('toolCalls')
  expect(kpis).toHaveProperty('successRate')
  for (const key of Object.keys(kpis)) {
    expectKpiShape(kpis[key])
  }
  expect(data).toHaveProperty('series')
  expect((data as { series: { daily?: unknown[] } }).series).toHaveProperty('daily')
  expect(Array.isArray((data as { series: { daily: unknown[] } }).series.daily)).toBe(true)
}

export function expectApiError(res: Response, status: number, code?: string): void {
  expect(res.status).toBe(status)
  expect(res.headers.get('content-type')).toContain('application/json')
}
