import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { startTestServer, stopTestServer, getServerPort } from '../helpers/server'
import {
  queryTokenTotals,
  querySessionsCount,
  queryToolCallsCount,
  querySessionIds,
} from '../helpers/db'
import { expectOverviewShape } from '../helpers/assertions'
import { getTestDbPath } from '../setup'

describe('E2E API tests', () => {
  beforeAll(async () => {
    const port = await startTestServer({
      CODEX_OBSERV_DB_PATH: getTestDbPath(),
    })
    expect(port).toBeGreaterThan(0)
  }, 60_000)

  afterAll(() => {
    stopTestServer()
  })

  function apiUrl(path: string, params?: Record<string, string>): string {
    const port = getServerPort()
    if (!port) throw new Error('Server not started')
    const base = `http://127.0.0.1:${port}`
    const url = path.startsWith('/') ? `${base}${path}` : `${base}/api/${path}`
    if (!params) return url
    const search = new URLSearchParams(params).toString()
    return `${url}${url.includes('?') ? '&' : '?'}${search}`
  }

  // Fixture data is from 2025-01-01 (ts 1735689600000)
  const fixtureRange = {
    startDate: '2024-12-01T00:00:00.000Z',
    endDate: '2025-02-01T00:00:00.000Z',
  }

  describe('GET /api/overview', () => {
    it('returns 200 and has kpis', async () => {
      const res = await fetch(apiUrl('/api/overview', fixtureRange))
      expect(res.status).toBe(200)
      const data = (await res.json()) as unknown
      expectOverviewShape(data)
    })

    it('response KPIs match DB aggregates', async () => {
      const res = await fetch(apiUrl('/api/overview', fixtureRange))
      expect(res.status).toBe(200)
      const data = (await res.json()) as {
        kpis: {
          totalTokens: { value: number }
          cacheHitRate: { value: number }
          sessions: { value: number }
          modelCalls: { value: number }
          toolCalls: { value: number }
          successRate: { value: number }
        }
      }
      const range = {
        startMs: new Date(fixtureRange.startDate).getTime(),
        endMs: new Date(fixtureRange.endDate).getTime(),
      }
      const tokens = queryTokenTotals(range)
      const sessions = querySessionsCount(range)
      const toolCalls = queryToolCallsCount(range)

      expect(data.kpis.totalTokens.value).toBe(tokens.totalTokens)
      expect(data.kpis.sessions.value).toBe(sessions)
      expect(data.kpis.modelCalls.value).toBe(tokens.modelCalls)
      expect(data.kpis.toolCalls.value).toBe(toolCalls.total)
      if (tokens.inputTokens > 0) {
        const expectedCacheRate = tokens.cachedInputTokens / tokens.inputTokens
        expect(Math.abs(data.kpis.cacheHitRate.value - expectedCacheRate)).toBeLessThan(0.001)
      }
      if (toolCalls.total > 0) {
        expect(Math.abs(data.kpis.successRate.value - toolCalls.successRate)).toBeLessThan(0.001)
      }
    })

    it('invalid date returns 400', async () => {
      const res = await fetch(apiUrl('/api/overview', { startDate: 'invalid' }))
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error?: string; code?: string }
      expect(body).toHaveProperty('error')
      expect(body).toHaveProperty('code')
    })
  })

  describe('GET /api/sessions', () => {
    it('returns 200 and has sessions array', async () => {
      const res = await fetch(apiUrl('/api/sessions'))
      expect(res.status).toBe(200)
      const data = (await res.json()) as { sessions: unknown[]; pagination: unknown }
      expect(Array.isArray(data.sessions)).toBe(true)
      expect(data).toHaveProperty('pagination')
      expect(data).toHaveProperty('filters')
    })

    it('pagination total matches DB count', async () => {
      const res = await fetch(apiUrl('/api/sessions'))
      expect(res.status).toBe(200)
      const data = (await res.json()) as { pagination: { total: number }; sessions: unknown[] }
      const dbCount = querySessionsCount()
      expect(data.pagination.total).toBe(dbCount)
      expect(data.sessions.length).toBeLessThanOrEqual(data.pagination.total)
    })
  })

  describe('GET /api/sessions/[id]', () => {
    it('returns 200 for existing session', async () => {
      const ids = querySessionIds(undefined, 1)
      if (ids.length === 0) {
        return // skip if no sessions
      }
      const res = await fetch(apiUrl(`/api/sessions/${ids[0]}`))
      expect(res.status).toBe(200)
      const data = (await res.json()) as { session: { id: string }; stats: unknown }
      expect(data.session.id).toBe(ids[0])
      expect(data).toHaveProperty('stats')
      expect(data).toHaveProperty('messages')
      expect(data).toHaveProperty('modelCalls')
      expect(data).toHaveProperty('toolCalls')
    })

    it('returns 404 for non-existent session', async () => {
      const res = await fetch(apiUrl('/api/sessions/nonexistent-id-12345'))
      expect(res.status).toBe(404)
      const body = (await res.json()) as { error?: string; code?: string }
      expect(body.code).toBe('not_found')
    })
  })

  describe('GET /api/models', () => {
    it('returns 200 and has models array', async () => {
      const res = await fetch(apiUrl('/api/models'))
      expect(res.status).toBe(200)
      const data = (await res.json()) as { models: unknown[]; pagination: unknown }
      expect(Array.isArray(data.models)).toBe(true)
      expect(data).toHaveProperty('pagination')
    })
  })

  describe('GET /api/providers', () => {
    it('returns 200 and has providers array', async () => {
      const res = await fetch(apiUrl('/api/providers'))
      expect(res.status).toBe(200)
      const data = (await res.json()) as { providers: unknown[]; pagination: unknown }
      expect(Array.isArray(data.providers)).toBe(true)
      expect(data).toHaveProperty('pagination')
    })
  })

  describe('GET /api/projects', () => {
    it('returns 200 and has projects array', async () => {
      const res = await fetch(apiUrl('/api/projects'))
      expect(res.status).toBe(200)
      const data = (await res.json()) as { projects: unknown[]; pagination: unknown }
      expect(Array.isArray(data.projects)).toBe(true)
      expect(data).toHaveProperty('pagination')
    })
  })

  describe('GET /api/projects/[id]', () => {
    it('returns 404 for non-existent project', async () => {
      const res = await fetch(apiUrl('/api/projects/nonexistent-project-id'))
      expect(res.status).toBe(404)
      const body = (await res.json()) as { error?: string; code?: string }
      expect(body.code).toBe('not_found')
    })
  })

  describe('GET /api/tool-calls', () => {
    it('returns 200 and has summary and toolCalls', async () => {
      const res = await fetch(apiUrl('/api/tool-calls'))
      expect(res.status).toBe(200)
      const data = (await res.json()) as {
        toolCalls: unknown[]
        summary: { total: number; successRate: number }
      }
      expect(Array.isArray(data.toolCalls)).toBe(true)
      expect(data).toHaveProperty('summary')
      expect(typeof data.summary.total).toBe('number')
      expect(typeof data.summary.successRate).toBe('number')
    })

    it('summary matches DB aggregates', async () => {
      const res = await fetch(apiUrl('/api/tool-calls'))
      expect(res.status).toBe(200)
      const data = (await res.json()) as { summary: { total: number; successRate: number } }
      const db = queryToolCallsCount()
      expect(data.summary.total).toBe(db.total)
      if (db.total > 0) {
        expect(Math.abs(data.summary.successRate - db.successRate)).toBeLessThan(0.001)
      }
    })
  })

  describe('GET /api/activity', () => {
    it('returns 200 and has activity and summary', async () => {
      const res = await fetch(apiUrl('/api/activity'))
      expect(res.status).toBe(200)
      const data = (await res.json()) as { activity: unknown[]; summary: unknown }
      expect(Array.isArray(data.activity)).toBe(true)
      expect(data).toHaveProperty('summary')
    })
  })

  describe('GET /api/ingest', () => {
    it('returns 200 and has status', async () => {
      const res = await fetch(apiUrl('/api/ingest'))
      expect(res.status).toBe(200)
      const data = (await res.json()) as { status: string; lastRun: unknown }
      expect(['idle', 'running']).toContain(data.status)
      expect(data).toHaveProperty('lastRun')
    })
  })

  describe('POST /api/ingest', () => {
    it('returns 200 and has lastResult', async () => {
      const res = await fetch(apiUrl('/api/ingest'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'incremental' }),
      })
      expect(res.status).toBe(200)
      const data = (await res.json()) as { status: string; lastRun: string; lastResult: unknown }
      expect(data.status).toBe('idle')
      expect(data).toHaveProperty('lastRun')
      expect(data).toHaveProperty('lastResult')
    })
  })

  describe('GET /api/sync-status', () => {
    it('returns 200 and has lastSyncedAt', async () => {
      const res = await fetch(apiUrl('/api/sync-status'))
      expect(res.status).toBe(200)
      const data = (await res.json()) as { lastSyncedAt: string | number | null }
      expect(data).toHaveProperty('lastSyncedAt')
      expect(
        data.lastSyncedAt === null ||
          typeof data.lastSyncedAt === 'string' ||
          typeof data.lastSyncedAt === 'number'
      ).toBe(true)
    })
  })
})
