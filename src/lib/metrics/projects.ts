import { toNumber } from '@/lib/utils'
import { applyDateRange, DateRange } from './date-range'
import { getDatabase, tableExists } from './db'
import { Pagination } from './pagination'
import { getPricingSync, getPricingForModel, computeCost } from '../pricing'

export type ProjectSortKey = 'lastSeen' | 'firstSeen' | 'name' | 'sessionCount' | 'totalTokens'
export type SortOrder = 'asc' | 'desc'

export interface ProjectsListOptions {
  range: DateRange
  pagination: Pagination
  search?: string | null
  sortBy?: ProjectSortKey
  sortOrder?: SortOrder
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

export interface ProjectsAggregates {
  totalProjects: number
  totalSessions: number
  totalTokens: number
  totalCost: number
  avgSuccessRate: number
}

export interface ProjectsListResult {
  total: number
  projects: ProjectListItem[]
  aggregates: ProjectsAggregates
}

export function getProjectsList(options: ProjectsListOptions): ProjectsListResult {
  const db = getDatabase()
  if (!tableExists(db, 'project') || !tableExists(db, 'session')) {
    return { 
      total: 0, 
      projects: [], 
      aggregates: { totalProjects: 0, totalSessions: 0, totalTokens: 0, totalCost: 0, avgSuccessRate: 0 } 
    }
  }

  const hasModelCall = tableExists(db, 'model_call')
  const hasToolCall = tableExists(db, 'tool_call')
  const pricingData = getPricingSync()

  const where: string[] = []
  const params: unknown[] = []
  applyDateRange('s.ts', options.range, where, params)
  const rangeWhere = where.length ? ` AND ${where.join(' AND ')}` : ''
  const rangeParams = params

  // 1. Calculate Aggregates (Global scope respecting filters)
  let totalProjects = 0
  let totalSessions = 0
  let totalTokens = 0
  let totalCost = 0
  let avgSuccessRate = 0

  // Total Projects & Sessions
  const totalsRow = db.prepare(`
    SELECT 
      COUNT(DISTINCT s.project_id) as projects,
      COUNT(*) as sessions
    FROM session s
    WHERE project_id IS NOT NULL ${rangeWhere}
  `).get(...rangeParams) as { projects: number; sessions: number }
  
  totalProjects = toNumber(totalsRow?.projects)
  totalSessions = toNumber(totalsRow?.sessions)

  // Total Tokens & Cost
  if (hasModelCall) {
     const modelUsageRows = db.prepare(
        `SELECT 
           mc.model,
           COALESCE(SUM(mc.total_tokens), 0) AS t, 
           COALESCE(SUM(mc.input_tokens), 0) AS i, 
           COALESCE(SUM(mc.cached_input_tokens), 0) AS c,
           COALESCE(SUM(mc.output_tokens), 0) AS o,
           COALESCE(SUM(mc.reasoning_tokens), 0) AS r
         FROM model_call mc 
         JOIN session s ON s.id = mc.session_id 
         WHERE s.project_id IS NOT NULL ${options.range.startMs != null ? ' AND mc.ts >= ? AND mc.ts <= ?' : ''}
         GROUP BY mc.model`
      ).all(
        ...(options.range.startMs != null 
          ? [options.range.startMs, options.range.endMs ?? Number.MAX_SAFE_INTEGER] 
          : [])
      ) as Array<{ model: string; t: number; i: number; c: number; o: number; r: number }>

      for (const mRow of modelUsageRows) {
        totalTokens += toNumber(mRow.t)
        const pricing = getPricingForModel(pricingData, mRow.model)
        if (pricing) {
          const cost = computeCost(
            pricing, 
            toNumber(mRow.i), 
            toNumber(mRow.c), 
            toNumber(mRow.o), 
            toNumber(mRow.r)
          )
          totalCost += (cost ?? 0)
        }
      }
  }

  // Tool Stats for Avg Success Rate
  if (hasToolCall) {
    const toolStats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN tc.status = 'ok' OR tc.status = 'unknown' OR tc.exit_code = 0 THEN 1 ELSE 0 END) as ok
      FROM tool_call tc
      JOIN session s ON s.id = tc.session_id
      WHERE s.project_id IS NOT NULL ${options.range.startMs != null ? ' AND tc.start_ts >= ? AND tc.start_ts <= ?' : ''}
    `).get(
        ...(options.range.startMs != null 
          ? [options.range.startMs, options.range.endMs ?? Number.MAX_SAFE_INTEGER] 
          : [])
    ) as { total: number; ok: number }
    
    if (toolStats && toNumber(toolStats.total) > 0) {
      avgSuccessRate = toNumber(toolStats.ok) / toNumber(toolStats.total)
    }
  }

  const aggregates: ProjectsAggregates = {
    totalProjects,
    totalSessions,
    totalTokens,
    totalCost,
    avgSuccessRate
  }

  // 2. Fetch Paginated List
  // Get List of Project IDs matching the filter
  const subWhere = options.range.startMs != null ? ' AND s.ts >= ? AND s.ts <= ?' : ''
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
    return { total: 0, projects: [], aggregates }
  }

  // Sorting
  const sortBy = options.sortBy ?? 'lastSeen'
  const sortOrder = options.sortOrder ?? 'desc'
  const direction = sortOrder === 'asc' ? 'ASC' : 'DESC'
  
  let orderByClause = 'ORDER BY last_seen_ts DESC NULLS LAST'
  
  // For complex sorts like sessionCount, we need to join or subquery in the ordering
  // But we are selecting from `project` table filtered by `projectIds` list.
  
  if (sortBy === 'name') {
    orderByClause = `ORDER BY name ${direction}`
  } else if (sortBy === 'firstSeen') {
    orderByClause = `ORDER BY first_seen_ts ${direction} NULLS LAST`
  } else if (sortBy === 'lastSeen') {
    orderByClause = `ORDER BY last_seen_ts ${direction} NULLS LAST`
  } else if (sortBy === 'sessionCount') {
     // This is tricky efficiently, but fine for small datasets
     orderByClause = `ORDER BY (SELECT COUNT(*) FROM session s WHERE s.project_id = project.id) ${direction}`
  } else if (sortBy === 'totalTokens' && hasModelCall) {
     orderByClause = `ORDER BY (SELECT COALESCE(SUM(mc.total_tokens),0) FROM model_call mc JOIN session s ON s.id = mc.session_id WHERE s.project_id = project.id) ${direction}`
  }

  const placeholders = projectIds.map(() => '?').join(',')
  const query = `SELECT id FROM project WHERE id IN (${placeholders}) ${orderByClause} LIMIT ? OFFSET ?`
  
  const paginatedIds = db
    .prepare(query)
    .all(...projectIds, options.pagination.limit, options.pagination.offset) as Array<{
    id: string
  }>

  const projects: ProjectListItem[] = []

  for (const row of paginatedIds) {
    const pid = row.id
    
    // 1. Session Count
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

    // 2. Token Metrics & Cost
    let totalTokens = 0
    let totalInputTokens = 0
    let totalCachedTokens = 0
    let estimatedCost = 0
    
    if (hasModelCall) {
      // Aggregate by model to compute cost correctly
      const modelUsageRows = db.prepare(
        `SELECT 
           mc.model,
           COALESCE(SUM(mc.total_tokens), 0) AS t, 
           COALESCE(SUM(mc.input_tokens), 0) AS i, 
           COALESCE(SUM(mc.cached_input_tokens), 0) AS c,
           COALESCE(SUM(mc.output_tokens), 0) AS o,
           COALESCE(SUM(mc.reasoning_tokens), 0) AS r
         FROM model_call mc 
         JOIN session s ON s.id = mc.session_id 
         WHERE s.project_id = ? ${options.range.startMs != null ? ' AND mc.ts >= ? AND mc.ts <= ?' : ''}
         GROUP BY mc.model`
      ).all(
        pid,
        ...(options.range.startMs != null 
          ? [options.range.startMs, options.range.endMs ?? Number.MAX_SAFE_INTEGER] 
          : [])
      ) as Array<{ model: string; t: number; i: number; c: number; o: number; r: number }>

      for (const mRow of modelUsageRows) {
        totalTokens += toNumber(mRow.t)
        totalInputTokens += toNumber(mRow.i)
        totalCachedTokens += toNumber(mRow.c)
        
        const pricing = getPricingForModel(pricingData, mRow.model)
        if (pricing) {
          const cost = computeCost(
            pricing, 
            toNumber(mRow.i), 
            toNumber(mRow.c), 
            toNumber(mRow.o), 
            toNumber(mRow.r)
          )
          estimatedCost += (cost ?? 0)
        }
      }
    }

    // 3. Tool Calls
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
      modelCallCount: 0, // removed from query for simplicity, can add back if critical
      toolCallCount,
      totalTokens,
      cacheHitRate: totalInputTokens > 0 ? totalCachedTokens / totalInputTokens : 0,
      estimatedCost,
      toolSuccessRate: toolCallCount > 0 ? toolOkCount / toolCallCount : 0,
    })
  }

  return { total: aggregates.totalProjects, projects, aggregates }
}

export interface DailyProjectStat {
  date: string
  prop: string
  value: number
}

export interface ModelBreakdown {
  model: string
  tokens: number
  cost: number
}

export interface ProjectDetailResult {
  project: ProjectListItem | null
  branches: Array<{ branch: string | null; commit: string | null; sessionCount: number }>
  history: DailyProjectStat[]
  tokenBreakdown: ModelBreakdown[]
}

export function getProjectDetail(projectId: string, range: DateRange): ProjectDetailResult {
  const db = getDatabase()
  if (!tableExists(db, 'project') || !tableExists(db, 'project_ref')) {
    return { project: null, branches: [], history: [], tokenBreakdown: [] }
  }

  const projRow = db.prepare('SELECT * FROM project WHERE id = ?').get(projectId) as
    | Record<string, unknown>
    | undefined
  if (!projRow) {
    return { project: null, branches: [], history: [], tokenBreakdown: [] }
  }

  const pricingData = getPricingSync()
  const hasModelCall = tableExists(db, 'model_call')
  const hasToolCall = tableExists(db, 'tool_call')

  const rangeWhere = range.startMs != null ? ' AND s.ts >= ? AND s.ts <= ?' : ''
  const rangeParams =
    range.startMs != null ? [range.startMs, range.endMs ?? Number.MAX_SAFE_INTEGER] : []

  // 1. Branches
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

  const mainParams = [projectId, ...rangeParams]
  const mainWhere = `session s WHERE project_id = ? ${range.startMs != null ? ' AND ts >= ? AND ts <= ?' : ''}`

  // 2. Counts
  const sessionCountRow = db
    .prepare(`SELECT COUNT(*) AS c FROM ${mainWhere}`)
    .get(...mainParams) as { c: number } | undefined
  const sessionCount = toNumber(sessionCountRow?.c)

  let totalTokens = 0
  let totalInputTokens = 0
  let totalCachedTokens = 0
  let estimatedCost = 0
  const tokenBreakdown: ModelBreakdown[] = []

  // 3. Model Stats & Breakdown
  if (hasModelCall) {
    const modelUsageRows = db.prepare(
      `SELECT 
         mc.model,
         COALESCE(SUM(mc.total_tokens), 0) AS t, 
         COALESCE(SUM(mc.input_tokens), 0) AS i, 
         COALESCE(SUM(mc.cached_input_tokens), 0) AS c,
         COALESCE(SUM(mc.output_tokens), 0) AS o,
         COALESCE(SUM(mc.reasoning_tokens), 0) AS r
       FROM model_call mc 
       JOIN session s ON s.id = mc.session_id 
       WHERE s.project_id = ? ${range.startMs != null ? ' AND mc.ts >= ? AND mc.ts <= ?' : ''}
       GROUP BY mc.model`
    ).all(...mainParams) as Array<{ model: string; t: number; i: number; c: number; o: number; r: number }>

    for (const mRow of modelUsageRows) {
      const t = toNumber(mRow.t)
      const i = toNumber(mRow.i)
      const c = toNumber(mRow.c)
      const o = toNumber(mRow.o)
      const r = toNumber(mRow.r)
      
      totalTokens += t
      totalInputTokens += i
      totalCachedTokens += c

      let modelCost = 0
      const pricing = getPricingForModel(pricingData, mRow.model)
      if (pricing) {
        modelCost = computeCost(pricing, i, c, o, r) ?? 0
        estimatedCost += modelCost
      }

      tokenBreakdown.push({
        model: mRow.model || 'Unknown',
        tokens: t,
        cost: modelCost
      })
    }
  }

  // 3. Tool Stats
  const toolStats = hasToolCall ? (db.prepare(
      `SELECT 
        COUNT(*) AS total, 
        SUM(CASE WHEN tc.status = 'ok' OR tc.status = 'unknown' OR tc.exit_code = 0 THEN 1 ELSE 0 END) AS ok 
       FROM tool_call tc 
       JOIN session s ON s.id = tc.session_id 
       WHERE s.project_id = ? ${range.startMs != null ? ' AND tc.start_ts >= ? AND tc.start_ts <= ?' : ''}`
    ).get(...mainParams) as { total: number; ok: number }) : { total: 0, ok: 0 }
    
  const toolCallCount = toNumber(toolStats?.total)
  const toolOkCount = toNumber(toolStats?.ok)

  // 4. History (Sessions per day)
  // For MVP, just sessions per day. Tokens per day requires more complex query or model_call join.
  // SQLite `strftime`
  const historyRows = db.prepare(`
    SELECT 
      strftime('%Y-%m-%d', s.ts / 1000, 'unixepoch') as day,
      COUNT(*) as count
    FROM session s
    WHERE project_id = ? ${rangeWhere}
    GROUP BY day
    ORDER BY day ASC
  `).all(projectId, ...rangeParams) as Array<{ day: string; count: number }>

  const history: DailyProjectStat[] = historyRows.map(r => ({
    date: r.day,
    prop: 'sessions',
    value: toNumber(r.count)
  }))

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
    cacheHitRate: totalInputTokens > 0 ? totalCachedTokens / totalInputTokens : 0,
    estimatedCost,
    toolSuccessRate: toolCallCount > 0 ? toolOkCount / toolCallCount : 0,
  }

  return { project, branches, history, tokenBreakdown }
}
