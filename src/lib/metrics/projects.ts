import { toNumber } from '@/lib/utils'
import { normalizeGitUrlForMerge, repoNameFromRemoteUrl } from '@/lib/format-git-remote'
import { applyDateRange, DateRange } from './date-range'
import { getDatabase, tableExists } from './db'
import { Pagination } from './pagination'
import { getPricingSync, getPricingForModel, computeCost } from '../pricing'

/** Canonical key for merging multiple worktrees/checkouts into one logical project. */
function projectMergeKey(name: string, gitRemote: string | null): string {
  const normalizedRemote = gitRemote?.trim()
  if (normalizedRemote) {
    const key = normalizeGitUrlForMerge(normalizedRemote)
    if (key) return key
  }
  return (name || '').trim().toLowerCase() || 'unknown'
}

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
      aggregates: {
        totalProjects: 0,
        totalSessions: 0,
        totalTokens: 0,
        totalCost: 0,
        avgSuccessRate: 0,
      },
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
  const totalsRow = db
    .prepare(
      `
    SELECT 
      COUNT(DISTINCT s.project_id) as projects,
      COUNT(*) as sessions
    FROM session s
    WHERE project_id IS NOT NULL ${rangeWhere}
  `
    )
    .get(...rangeParams) as { projects: number; sessions: number }

  totalProjects = toNumber(totalsRow?.projects)
  totalSessions = toNumber(totalsRow?.sessions)

  // Total Tokens & Cost
  if (hasModelCall) {
    const modelUsageRows = db
      .prepare(
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
      )
      .all(
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
        totalCost += cost ?? 0
      }
    }
  }

  // Tool Stats for Avg Success Rate
  if (hasToolCall) {
    const toolStats = db
      .prepare(
        `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN tc.status = 'ok' OR tc.status = 'unknown' OR tc.exit_code = 0 THEN 1 ELSE 0 END) as ok
      FROM tool_call tc
      JOIN session s ON s.id = tc.session_id
      WHERE s.project_id IS NOT NULL ${options.range.startMs != null ? ' AND tc.start_ts >= ? AND tc.start_ts <= ?' : ''}
    `
      )
      .get(
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
    avgSuccessRate,
  }

  // 2. Fetch project rows and group by merge key (same repo/worktrees = one logical project)
  const subWhere = options.range.startMs != null ? ' AND s.ts >= ? AND s.ts <= ?' : ''
  const projectIdsStmt = db.prepare(
    `SELECT DISTINCT project_id AS id FROM session s WHERE project_id IS NOT NULL ${subWhere}`
  )
  const projectIdRows = (
    options.range.startMs != null
      ? projectIdsStmt.all(options.range.startMs, options.range.endMs ?? Number.MAX_SAFE_INTEGER)
      : projectIdsStmt.all()
  ) as Array<{ id: string }>

  const rawProjectIds = projectIdRows.map((r) => r.id)
  if (rawProjectIds.length === 0) {
    return { total: 0, projects: [], aggregates }
  }

  const placeholders = rawProjectIds.map(() => '?').join(',')
  const projectRows = db
    .prepare(
      `SELECT id, name, root_path, git_remote, first_seen_ts, last_seen_ts FROM project WHERE id IN (${placeholders})`
    )
    .all(...rawProjectIds) as Array<{
    id: string
    name: string
    root_path: string | null
    git_remote: string | null
    first_seen_ts: number | null
    last_seen_ts: number | null
  }>

  const searchLower = options.search?.trim().toLowerCase()
  const rowsFiltered = searchLower
    ? projectRows.filter(
        (p) =>
          (p.name && p.name.toLowerCase().includes(searchLower)) ||
          (p.root_path && p.root_path.toLowerCase().includes(searchLower)) ||
          (p.git_remote && p.git_remote.toLowerCase().includes(searchLower))
      )
    : projectRows

  const mergeKeyToIds = new Map<string, string[]>()
  for (const p of rowsFiltered) {
    const key = projectMergeKey(p.name, p.git_remote)
    const list = mergeKeyToIds.get(key) ?? []
    list.push(p.id)
    mergeKeyToIds.set(key, list)
  }

  const mergeKeyToDisplay = new Map<string, (typeof projectRows)[0]>()
  for (const p of rowsFiltered) {
    const key = projectMergeKey(p.name, p.git_remote)
    const existing = mergeKeyToDisplay.get(key)
    if (!existing) mergeKeyToDisplay.set(key, p)
    else {
      const existingTs = existing.last_seen_ts ?? 0
      const pTs = p.last_seen_ts ?? 0
      if (pTs > existingTs || (p.git_remote && !existing.git_remote)) mergeKeyToDisplay.set(key, p)
    }
  }

  const sortBy = options.sortBy ?? 'lastSeen'
  const sortOrder = options.sortOrder ?? 'desc'
  const listRangeParams =
    options.range.startMs != null
      ? [options.range.startMs, options.range.endMs ?? Number.MAX_SAFE_INTEGER]
      : []

  const sessionCountStmt = db.prepare(
    `SELECT project_id, COUNT(*) AS c FROM session WHERE project_id IS NOT NULL ${options.range.startMs != null ? ' AND ts >= ? AND ts <= ?' : ''} GROUP BY project_id`
  )
  const sessionCountByPid = new Map<string, number>()
  const sessionCountRows = (
    options.range.startMs != null
      ? sessionCountStmt.all(...listRangeParams)
      : sessionCountStmt.all()
  ) as Array<{ project_id: string; c: number }>
  for (const r of sessionCountRows) sessionCountByPid.set(r.project_id, toNumber(r.c))

  const tokenSumByPid = new Map<string, number>()
  if (hasModelCall) {
    const tokenRows = db
      .prepare(
        `SELECT s.project_id, COALESCE(SUM(mc.total_tokens),0) AS t FROM model_call mc JOIN session s ON s.id = mc.session_id WHERE s.project_id IS NOT NULL ${options.range.startMs != null ? ' AND mc.ts >= ? AND mc.ts <= ?' : ''} GROUP BY s.project_id`
      )
      .all(...(options.range.startMs != null ? listRangeParams : [])) as Array<{
      project_id: string
      t: number
    }>
    for (const r of tokenRows) tokenSumByPid.set(r.project_id, toNumber(r.t))
  }

  type ProjectRow = (typeof projectRows)[0]
  function canonicalName(row: ProjectRow): string {
    const fromRemote = repoNameFromRemoteUrl(row.git_remote)
    if (fromRemote) return fromRemote
    return (row.name || '').trim().toLowerCase() || 'unknown'
  }

  const canonicalToGroup = new Map<string, { pids: string[]; displayRow: ProjectRow }>()
  for (const [mergeKey, pids] of mergeKeyToIds) {
    const display = mergeKeyToDisplay.get(mergeKey)!
    const can = canonicalName(display)
    const existing = canonicalToGroup.get(can)
    if (!existing) {
      canonicalToGroup.set(can, { pids: [...pids], displayRow: display })
    } else {
      existing.pids.push(...pids)
      const prefer =
        display.git_remote && !existing.displayRow.git_remote
          ? display
          : (display.last_seen_ts ?? 0) > (existing.displayRow.last_seen_ts ?? 0)
            ? display
            : existing.displayRow
      existing.displayRow = prefer
    }
  }

  const mergedGroups: Array<{ pids: string[]; displayRow: ProjectRow }> = []
  for (const group of canonicalToGroup.values()) {
    mergedGroups.push(group)
  }

  const cmp = sortOrder === 'asc' ? 1 : -1
  const sessionSum = (pids: string[]) =>
    pids.reduce((s, pid) => s + (sessionCountByPid.get(pid) ?? 0), 0)
  const tokenSum = (pids: string[]) => pids.reduce((s, pid) => s + (tokenSumByPid.get(pid) ?? 0), 0)
  const maxLastTs = (pids: string[]) =>
    Math.max(...pids.map((pid) => projectRows.find((r) => r.id === pid)?.last_seen_ts ?? 0))
  const minFirstTs = (pids: string[]) =>
    Math.min(
      ...pids.map(
        (pid) => projectRows.find((r) => r.id === pid)?.first_seen_ts ?? Number.MAX_SAFE_INTEGER
      ),
      Number.MAX_SAFE_INTEGER
    )

  mergedGroups.sort((a, b) => {
    const nameA = a.displayRow.name ?? ''
    const nameB = b.displayRow.name ?? ''
    let diff = 0
    if (sortBy === 'name') diff = nameA.localeCompare(nameB)
    else if (sortBy === 'sessionCount') diff = sessionSum(a.pids) - sessionSum(b.pids)
    else if (sortBy === 'totalTokens') diff = tokenSum(a.pids) - tokenSum(b.pids)
    else if (sortBy === 'lastSeen') diff = maxLastTs(a.pids) - maxLastTs(b.pids)
    else if (sortBy === 'firstSeen') diff = minFirstTs(a.pids) - minFirstTs(b.pids)
    else diff = maxLastTs(a.pids) - maxLastTs(b.pids)
    return diff * cmp
  })

  const totalMerged = mergedGroups.length
  const { limit, offset } = options.pagination
  const paginatedGroups = mergedGroups.slice(offset, offset + limit)

  const projects: ProjectListItem[] = []
  for (const { pids, displayRow } of paginatedGroups) {
    let sessionCount = 0
    let totalTokens = 0
    let totalInputTokens = 0
    let totalCachedTokens = 0
    let estimatedCost = 0
    let toolCallCount = 0
    let toolOkCount = 0

    for (const pid of pids) {
      sessionCount += sessionCountByPid.get(pid) ?? 0
      totalTokens += tokenSumByPid.get(pid) ?? 0

      if (hasModelCall) {
        const modelRows = db
          .prepare(
            `SELECT mc.model, COALESCE(SUM(mc.input_tokens),0) AS i, COALESCE(SUM(mc.cached_input_tokens),0) AS c, COALESCE(SUM(mc.output_tokens),0) AS o, COALESCE(SUM(mc.reasoning_tokens),0) AS r
             FROM model_call mc JOIN session s ON s.id = mc.session_id WHERE s.project_id = ? ${options.range.startMs != null ? ' AND mc.ts >= ? AND mc.ts <= ?' : ''} GROUP BY mc.model`
          )
          .all(pid, ...(options.range.startMs != null ? listRangeParams : [])) as Array<{
          model: string
          i: number
          c: number
          o: number
          r: number
        }>
        for (const mRow of modelRows) {
          totalInputTokens += toNumber(mRow.i)
          totalCachedTokens += toNumber(mRow.c)
          const pricing = getPricingForModel(pricingData, mRow.model)
          if (pricing)
            estimatedCost +=
              computeCost(
                pricing,
                toNumber(mRow.i),
                toNumber(mRow.c),
                toNumber(mRow.o),
                toNumber(mRow.r)
              ) ?? 0
        }
      }

      if (hasToolCall) {
        const toolRow = db
          .prepare(
            `SELECT COUNT(*) AS total, SUM(CASE WHEN tc.status = 'ok' OR tc.status = 'unknown' OR tc.exit_code = 0 THEN 1 ELSE 0 END) AS ok FROM tool_call tc JOIN session s ON s.id = tc.session_id WHERE s.project_id = ? ${options.range.startMs != null ? ' AND tc.start_ts >= ? AND tc.start_ts <= ?' : ''}`
          )
          .get(pid, ...(options.range.startMs != null ? listRangeParams : [])) as {
          total: number
          ok: number
        }
        toolCallCount += toNumber(toolRow?.total)
        toolOkCount += toNumber(toolRow?.ok)
      }
    }

    const primaryId = pids[0]
    const firstSeenVals = pids.map(
      (pid) => projectRows.find((r) => r.id === pid)?.first_seen_ts ?? Number.MAX_SAFE_INTEGER
    )
    const firstSeen =
      Math.min(...firstSeenVals) === Number.MAX_SAFE_INTEGER ? null : Math.min(...firstSeenVals)
    const lastSeen = Math.max(
      ...pids.map((pid) => projectRows.find((r) => r.id === pid)?.last_seen_ts ?? 0)
    )
    projects.push({
      id: primaryId,
      name: displayRow.name ?? '',
      rootPath: pids.length > 1 ? null : displayRow.root_path,
      gitRemote: displayRow.git_remote,
      firstSeenTs: firstSeen,
      lastSeenTs: lastSeen || null,
      sessionCount,
      modelCallCount: 0,
      toolCallCount,
      totalTokens,
      cacheHitRate: totalInputTokens > 0 ? totalCachedTokens / totalInputTokens : 0,
      estimatedCost,
      toolSuccessRate: toolCallCount > 0 ? toolOkCount / toolCallCount : 0,
    })
  }

  const aggregatesMerged = { ...aggregates, totalProjects: totalMerged }
  return { total: totalMerged, projects, aggregates: aggregatesMerged }
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

type ProjectRowForGroup = {
  id: string
  name: string
  root_path: string | null
  git_remote: string | null
  first_seen_ts: number | null
  last_seen_ts: number | null
}

function canonicalNameFromRow(row: ProjectRowForGroup): string {
  const fromRemote = repoNameFromRemoteUrl(row.git_remote)
  if (fromRemote) return fromRemote
  return (row.name || '').trim().toLowerCase() || 'unknown'
}

/**
 * Resolves all project IDs that belong to the same logical project (same canonical name).
 * Used so the detail view can aggregate across all workspaces/checkouts.
 */
function getProjectGroup(
  db: ReturnType<typeof getDatabase>,
  projectId: string
): { projectIds: string[]; displayRow: ProjectRowForGroup } | null {
  const projRow = db
    .prepare(
      'SELECT id, name, root_path, git_remote, first_seen_ts, last_seen_ts FROM project WHERE id = ?'
    )
    .get(projectId) as ProjectRowForGroup | undefined
  if (!projRow) return null

  const canonical = canonicalNameFromRow(projRow)
  const allRows = db
    .prepare('SELECT id, name, root_path, git_remote, first_seen_ts, last_seen_ts FROM project')
    .all() as ProjectRowForGroup[]
  const sameGroup = allRows.filter((r) => canonicalNameFromRow(r) === canonical)
  if (sameGroup.length === 0) return null

  const projectIds = sameGroup.map((r) => r.id)
  const displayRow =
    sameGroup.find((r) => r.git_remote) ??
    sameGroup.sort((a, b) => (b.last_seen_ts ?? 0) - (a.last_seen_ts ?? 0))[0]
  return { projectIds, displayRow }
}

export function getProjectDetail(projectId: string, range: DateRange): ProjectDetailResult {
  const db = getDatabase()
  if (!tableExists(db, 'project') || !tableExists(db, 'project_ref')) {
    return { project: null, branches: [], history: [], tokenBreakdown: [] }
  }

  const group = getProjectGroup(db, projectId)
  if (!group) {
    return { project: null, branches: [], history: [], tokenBreakdown: [] }
  }

  const { projectIds, displayRow } = group
  const pricingData = getPricingSync()
  const hasModelCall = tableExists(db, 'model_call')
  const hasToolCall = tableExists(db, 'tool_call')

  const rangeWhere = range.startMs != null ? ' AND s.ts >= ? AND s.ts <= ?' : ''
  const rangeParams =
    range.startMs != null ? [range.startMs, range.endMs ?? Number.MAX_SAFE_INTEGER] : []
  const placeholders = projectIds.map(() => '?').join(',')
  const mainParams = [...projectIds, ...rangeParams]

  // 1. Branches (all refs across all project_ids in group)
  const refRows = db
    .prepare(
      `SELECT pr.branch,
        COALESCE(pr."commit", MAX(s.git_commit)) AS commit_sha,
        COUNT(s.id) AS session_count
       FROM project_ref pr
       LEFT JOIN session s
         ON (
           s.project_ref_id = pr.id
           OR (
             s.project_ref_id IS NULL
             AND s.project_id = pr.project_id
             AND (pr.branch IS NULL OR s.git_branch = pr.branch)
           )
         )
         ${range.startMs != null ? ' AND s.ts >= ? AND s.ts <= ?' : ''}
       WHERE pr.project_id IN (${placeholders})
       GROUP BY pr.id, pr.branch, pr."commit"
       ORDER BY pr.last_seen_ts DESC NULLS LAST`
    )
    .all(
      ...(range.startMs != null ? [range.startMs, range.endMs ?? Number.MAX_SAFE_INTEGER] : []),
      ...projectIds
    ) as Record<string, unknown>[]

  const branches = refRows.map((r) => ({
    branch: (r.branch as string | null) ?? null,
    commit: (r.commit_sha as string | null) ?? null,
    sessionCount: toNumber(r.session_count),
  }))

  const mainWhere = `session s WHERE project_id IN (${placeholders}) ${range.startMs != null ? ' AND ts >= ? AND ts <= ?' : ''}`

  // 2. Counts (aggregate across all project_ids)
  const sessionCountRow = db
    .prepare(`SELECT COUNT(*) AS c FROM ${mainWhere}`)
    .get(...mainParams) as { c: number } | undefined
  const sessionCount = toNumber(sessionCountRow?.c)

  let totalTokens = 0
  let totalInputTokens = 0
  let totalCachedTokens = 0
  let estimatedCost = 0
  const tokenBreakdown: ModelBreakdown[] = []

  // 3. Model Stats & Breakdown (aggregate across all project_ids)
  if (hasModelCall) {
    const modelUsageRows = db
      .prepare(
        `SELECT 
         mc.model,
         COALESCE(SUM(mc.total_tokens), 0) AS t, 
         COALESCE(SUM(mc.input_tokens), 0) AS i, 
         COALESCE(SUM(mc.cached_input_tokens), 0) AS c,
         COALESCE(SUM(mc.output_tokens), 0) AS o,
         COALESCE(SUM(mc.reasoning_tokens), 0) AS r
       FROM model_call mc 
       JOIN session s ON s.id = mc.session_id 
       WHERE s.project_id IN (${placeholders}) ${range.startMs != null ? ' AND mc.ts >= ? AND mc.ts <= ?' : ''}
       GROUP BY mc.model`
      )
      .all(...mainParams) as Array<{
      model: string
      t: number
      i: number
      c: number
      o: number
      r: number
    }>

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
        cost: modelCost,
      })
    }
  }

  const toolStats = hasToolCall
    ? (db
        .prepare(
          `SELECT 
        COUNT(*) AS total, 
        SUM(CASE WHEN tc.status = 'ok' OR tc.status = 'unknown' OR tc.exit_code = 0 THEN 1 ELSE 0 END) AS ok 
       FROM tool_call tc 
       JOIN session s ON s.id = tc.session_id 
       WHERE s.project_id IN (${placeholders}) ${range.startMs != null ? ' AND tc.start_ts >= ? AND tc.start_ts <= ?' : ''}`
        )
        .get(...mainParams) as { total: number; ok: number })
    : { total: 0, ok: 0 }

  const toolCallCount = toNumber(toolStats?.total)
  const toolOkCount = toNumber(toolStats?.ok)

  // 4. History (sessions per day, aggregated across all project_ids)
  const historyRows = db
    .prepare(
      `
    SELECT 
      strftime('%Y-%m-%d', s.ts / 1000, 'unixepoch') as day,
      COUNT(*) as count
    FROM session s
    WHERE project_id IN (${placeholders}) ${rangeWhere}
    GROUP BY day
    ORDER BY day ASC
  `
    )
    .all(...mainParams) as Array<{ day: string; count: number }>

  const history: DailyProjectStat[] = historyRows.map((r) => ({
    date: r.day,
    prop: 'sessions',
    value: toNumber(r.count),
  }))

  const firstSeen = Math.min(
    ...projectIds.map((pid) => {
      const row = db.prepare('SELECT first_seen_ts FROM project WHERE id = ?').get(pid) as {
        first_seen_ts: number | null
      }
      return row?.first_seen_ts ?? Number.MAX_SAFE_INTEGER
    })
  )
  const lastSeen = Math.max(
    ...projectIds.map((pid) => {
      const row = db.prepare('SELECT last_seen_ts FROM project WHERE id = ?').get(pid) as {
        last_seen_ts: number | null
      }
      return row?.last_seen_ts ?? 0
    })
  )

  const project: ProjectListItem = {
    id: projectId,
    name: displayRow.name ?? '',
    rootPath: projectIds.length > 1 ? null : displayRow.root_path,
    gitRemote: displayRow.git_remote,
    firstSeenTs: firstSeen === Number.MAX_SAFE_INTEGER ? null : firstSeen,
    lastSeenTs: lastSeen || null,
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
