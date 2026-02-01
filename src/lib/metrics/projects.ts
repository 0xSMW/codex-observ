import { toNumber } from '@/lib/utils'
import { applyDateRange, DateRange } from './date-range'
import { getDatabase, tableExists } from './db'
import { Pagination } from './pagination'

export interface ProjectsListOptions {
  range: DateRange
  pagination: Pagination
  search?: string | null
}

export interface ProjectListItem {
  id: string
  name: string
  rootPath: string | null
  gitRemote: string | null
  firstSeenTs: number | null
  lastSeenTs: number | null
  sessionCount: number
  modelCallCount: number
  toolCallCount: number
  totalTokens: number
  cacheHitRate: number
  estimatedCost: number
  toolSuccessRate: number
}

export interface ProjectsListResult {
  total: number
  projects: ProjectListItem[]
}

export function getProjectsList(options: ProjectsListOptions): ProjectsListResult {
  const db = getDatabase()
  if (!tableExists(db, 'project') || !tableExists(db, 'session')) {
    return { total: 0, projects: [] }
  }

  const hasModelCall = tableExists(db, 'model_call')
  const hasToolCall = tableExists(db, 'tool_call')

  const where: string[] = []
  const params: unknown[] = []
  applyDateRange('s.ts', options.range, where, params)
  const rangeWhere = where.length ? ` AND ${where.join(' AND ')}` : ''
  const rangeParams = params

  const totalRow = db
    .prepare(
      `SELECT COUNT(DISTINCT p.id) AS total FROM project p
       WHERE p.id IN (SELECT DISTINCT project_id FROM session s WHERE project_id IS NOT NULL${rangeWhere})`
    )
    .get(...rangeParams) as Record<string, unknown> | undefined
  const total = toNumber(totalRow?.total)

  const subWhere = options.range.startMs != null ? ' AND s.ts >= ? AND s.ts <= ?' : ''
  const listParams: unknown[] = []
  if (options.range.startMs != null) {
    listParams.push(options.range.startMs, options.range.endMs ?? Number.MAX_SAFE_INTEGER)
  }
  const projectIdsStmt = db.prepare(
    `SELECT DISTINCT project_id AS id FROM session s WHERE project_id IS NOT NULL ${subWhere}`
  )
  const projectIdRows = (
    options.range.startMs != null
      ? projectIdsStmt.all(options.range.startMs, options.range.endMs ?? Number.MAX_SAFE_INTEGER)
      : projectIdsStmt.all()
  ) as Array<{ id: string }>

  const projectIds = projectIdRows.map((r) => r.id)
  if (projectIds.length === 0) {
    return { total: 0, projects: [] }
  }

  const placeholders = projectIds.map(() => '?').join(',')
  const paginatedIds = db
    .prepare(
      `SELECT id FROM project WHERE id IN (${placeholders}) ORDER BY last_seen_ts DESC NULLS LAST LIMIT ? OFFSET ?`
    )
    .all(...projectIds, options.pagination.limit, options.pagination.offset) as Array<{
    id: string
  }>

  const projects: ProjectListItem[] = []

  for (const row of paginatedIds) {
    const pid = row.id
    const sessionCountRow = db
      .prepare(
        `SELECT COUNT(*) AS c FROM session WHERE project_id = ? ${options.range.startMs != null ? ' AND ts >= ? AND ts <= ?' : ''}`
      )
      .get(
        pid,
        ...(options.range.startMs != null
          ? [options.range.startMs, options.range.endMs ?? Number.MAX_SAFE_INTEGER]
          : [])
      ) as Record<string, unknown>
    const totalTokensRow = hasModelCall
      ? (db
          .prepare(
            `SELECT COALESCE(SUM(mc.total_tokens), 0) AS t, COALESCE(SUM(mc.input_tokens), 0) AS i, COALESCE(SUM(mc.cached_input_tokens), 0) AS c FROM model_call mc JOIN session s ON s.id = mc.session_id WHERE s.project_id = ? ${options.range.startMs != null ? ' AND mc.ts >= ? AND mc.ts <= ?' : ''}`
          )
          .get(
            pid,
            ...(options.range.startMs != null
              ? [options.range.startMs, options.range.endMs ?? Number.MAX_SAFE_INTEGER]
              : [])
          ) as Record<string, unknown>)
      : { t: 0, i: 0, c: 0 }
    const toolRow = hasToolCall
      ? (db
          .prepare(
            `SELECT COUNT(*) AS total, SUM(CASE WHEN tc.status = 'ok' OR tc.status = 'unknown' OR tc.exit_code = 0 THEN 1 ELSE 0 END) AS ok FROM tool_call tc JOIN session s ON s.id = tc.session_id WHERE s.project_id = ? ${options.range.startMs != null ? ' AND tc.start_ts >= ? AND tc.start_ts <= ?' : ''}`
          )
          .get(
            pid,
            ...(options.range.startMs != null
              ? [options.range.startMs, options.range.endMs ?? Number.MAX_SAFE_INTEGER]
              : [])
          ) as Record<string, unknown>)
      : { total: 0, ok: 0 }

    const projRow = db.prepare('SELECT * FROM project WHERE id = ?').get(pid) as Record<
      string,
      unknown
    >
    const inputTokens = toNumber(totalTokensRow?.i)
    const cachedTokens = toNumber(totalTokensRow?.c)
    const toolCallCount = toNumber(toolRow?.total)
    const toolOkCount = toNumber(toolRow?.ok)

    projects.push({
      id: String(projRow?.id ?? pid),
      name: String(projRow?.name ?? ''),
      rootPath: (projRow?.root_path as string | null) ?? null,
      gitRemote: (projRow?.git_remote as string | null) ?? null,
      firstSeenTs: projRow?.first_seen_ts == null ? null : toNumber(projRow.first_seen_ts),
      lastSeenTs: projRow?.last_seen_ts == null ? null : toNumber(projRow.last_seen_ts),
      sessionCount: toNumber(sessionCountRow?.c),
      modelCallCount: 0,
      toolCallCount,
      totalTokens: toNumber(totalTokensRow?.t),
      cacheHitRate: inputTokens > 0 ? cachedTokens / inputTokens : 0,
      estimatedCost: 0,
      toolSuccessRate: toolCallCount > 0 ? toolOkCount / toolCallCount : 0,
    })
  }

  return { total, projects }
}

export interface ProjectDetailResult {
  project: ProjectListItem | null
  branches: Array<{ branch: string | null; commit: string | null; sessionCount: number }>
}

export function getProjectDetail(projectId: string, range: DateRange): ProjectDetailResult {
  const db = getDatabase()
  if (!tableExists(db, 'project') || !tableExists(db, 'project_ref')) {
    return { project: null, branches: [] }
  }

  const projRow = db.prepare('SELECT * FROM project WHERE id = ?').get(projectId) as
    | Record<string, unknown>
    | undefined
  if (!projRow) {
    return { project: null, branches: [] }
  }

  const rangeWhere = range.startMs != null ? ' AND s.ts >= ? AND s.ts <= ?' : ''
  const rangeParams =
    range.startMs != null ? [range.startMs, range.endMs ?? Number.MAX_SAFE_INTEGER] : []

  const refRows = db
    .prepare(
      `SELECT pr.branch, pr."commit",
        (SELECT COUNT(*) FROM session s WHERE s.project_ref_id = pr.id ${rangeWhere}) AS session_count
       FROM project_ref pr
       WHERE pr.project_id = ?
       ORDER BY pr.last_seen_ts DESC NULLS LAST`
    )
    .all(projectId, ...rangeParams) as Record<string, unknown>[]

  const branches = refRows.map((r) => ({
    branch: (r.branch as string | null) ?? null,
    commit: (r.commit as string | null) ?? null,
    sessionCount: toNumber(r.session_count),
  }))

  const hasModelCall = tableExists(db, 'model_call')
  const hasToolCall = tableExists(db, 'tool_call')

  const sessionCountRow = db
    .prepare(
      `SELECT COUNT(*) AS c FROM session WHERE project_id = ? ${range.startMs != null ? ' AND ts >= ? AND ts <= ?' : ''}`
    )
    .get(projectId, ...rangeParams) as { c: number } | undefined
  const sessionCount = toNumber(sessionCountRow?.c)

  const totalTokensRow =
    hasModelCall && range.startMs != null
      ? (db
          .prepare(
            'SELECT COALESCE(SUM(mc.total_tokens), 0) AS t FROM model_call mc JOIN session s ON s.id = mc.session_id WHERE s.project_id = ? AND mc.ts >= ? AND mc.ts <= ?'
          )
          .get(projectId, range.startMs, range.endMs ?? Number.MAX_SAFE_INTEGER) as
          | { t: number }
          | undefined)
      : hasModelCall
        ? (db
            .prepare(
              'SELECT COALESCE(SUM(mc.total_tokens), 0) AS t FROM model_call mc JOIN session s ON s.id = mc.session_id WHERE s.project_id = ?'
            )
            .get(projectId) as { t: number } | undefined)
        : undefined
  const totalTokens = toNumber(totalTokensRow?.t)

  const inputTokensRow =
    hasModelCall && range.startMs != null
      ? (db
          .prepare(
            'SELECT COALESCE(SUM(mc.input_tokens), 0) AS t FROM model_call mc JOIN session s ON s.id = mc.session_id WHERE s.project_id = ? AND mc.ts >= ? AND mc.ts <= ?'
          )
          .get(projectId, range.startMs, range.endMs ?? Number.MAX_SAFE_INTEGER) as
          | { t: number }
          | undefined)
      : hasModelCall
        ? (db
            .prepare(
              'SELECT COALESCE(SUM(mc.input_tokens), 0) AS t FROM model_call mc JOIN session s ON s.id = mc.session_id WHERE s.project_id = ?'
            )
            .get(projectId) as { t: number } | undefined)
        : undefined
  const inputTokens = toNumber(inputTokensRow?.t)

  const cachedTokensRow =
    hasModelCall && range.startMs != null
      ? (db
          .prepare(
            'SELECT COALESCE(SUM(mc.cached_input_tokens), 0) AS t FROM model_call mc JOIN session s ON s.id = mc.session_id WHERE s.project_id = ? AND mc.ts >= ? AND mc.ts <= ?'
          )
          .get(projectId, range.startMs, range.endMs ?? Number.MAX_SAFE_INTEGER) as
          | { t: number }
          | undefined)
      : hasModelCall
        ? (db
            .prepare(
              'SELECT COALESCE(SUM(mc.cached_input_tokens), 0) AS t FROM model_call mc JOIN session s ON s.id = mc.session_id WHERE s.project_id = ?'
            )
            .get(projectId) as { t: number } | undefined)
        : undefined
  const cachedTokens = toNumber(cachedTokensRow?.t)

  const toolCallCountRow =
    hasToolCall && range.startMs != null
      ? (db
          .prepare(
            'SELECT COUNT(*) AS t FROM tool_call tc JOIN session s ON s.id = tc.session_id WHERE s.project_id = ? AND tc.start_ts >= ? AND tc.start_ts <= ?'
          )
          .get(projectId, range.startMs, range.endMs ?? Number.MAX_SAFE_INTEGER) as
          | { t: number }
          | undefined)
      : hasToolCall
        ? (db
            .prepare(
              'SELECT COUNT(*) AS t FROM tool_call tc JOIN session s ON s.id = tc.session_id WHERE s.project_id = ?'
            )
            .get(projectId) as { t: number } | undefined)
        : undefined
  const toolCallCount = toNumber(toolCallCountRow?.t)

  const toolOkCountRow =
    hasToolCall && range.startMs != null
      ? (db
          .prepare(
            "SELECT SUM(CASE WHEN tc.status = 'ok' OR tc.status = 'unknown' OR tc.exit_code = 0 THEN 1 ELSE 0 END) AS t FROM tool_call tc JOIN session s ON s.id = tc.session_id WHERE s.project_id = ? AND tc.start_ts >= ? AND tc.start_ts <= ?"
          )
          .get(projectId, range.startMs, range.endMs ?? Number.MAX_SAFE_INTEGER) as
          | { t: number }
          | undefined)
      : hasToolCall
        ? (db
            .prepare(
              "SELECT SUM(CASE WHEN tc.status = 'ok' OR tc.status = 'unknown' OR tc.exit_code = 0 THEN 1 ELSE 0 END) AS t FROM tool_call tc JOIN session s ON s.id = tc.session_id WHERE s.project_id = ?"
            )
            .get(projectId) as { t: number } | undefined)
        : undefined
  const toolOkCount = toNumber(toolOkCountRow?.t)

  const project: ProjectListItem = {
    id: String(projRow.id ?? ''),
    name: String(projRow.name ?? ''),
    rootPath: (projRow.root_path as string | null) ?? null,
    gitRemote: (projRow.git_remote as string | null) ?? null,
    firstSeenTs: projRow.first_seen_ts == null ? null : toNumber(projRow.first_seen_ts),
    lastSeenTs: projRow.last_seen_ts == null ? null : toNumber(projRow.last_seen_ts),
    sessionCount,
    modelCallCount: 0,
    toolCallCount,
    totalTokens,
    cacheHitRate: inputTokens > 0 ? cachedTokens / inputTokens : 0,
    estimatedCost: 0,
    toolSuccessRate: toolCallCount > 0 ? toolOkCount / toolCallCount : 0,
  }

  return { project, branches }
}
