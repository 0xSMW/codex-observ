import type { Db } from '../db'
import { getDb } from '../db'
import { upsertProject, upsertProjectRef } from '../db/queries/projects'
import { updateSessionProjectIds } from '../db/queries/sessions'
import { deriveProjectAndRef } from './project-id'

/**
 * Re-derives project and project_ref from each session, upserts project/project_ref,
 * and updates each session's project_id/project_ref_id so they point to the consolidated project.
 * Use after changing project-id logic (e.g. conductor naming) to refresh project names
 * and collapse workspaces (e.g. conductor) into one project per repo.
 */
export function refreshProjectNames(db?: Db): number {
  const database = db ?? getDb()

  const rows = database
    .prepare(
      `SELECT id, ts, cwd, git_branch, git_commit
       FROM session
       WHERE cwd IS NOT NULL AND cwd != ''`
    )
    .all() as Array<{
    id: string
    ts: number
    cwd: string | null
    git_branch: string | null
    git_commit: string | null
  }>

  let refreshed = 0
  for (const row of rows) {
    const record = {
      id: row.id,
      ts: row.ts,
      cwd: row.cwd,
      originator: null as string | null,
      cli_version: null as string | null,
      model_provider: null as string | null,
      git_branch: row.git_branch,
      git_commit: row.git_commit,
      source_file: '',
      source_line: 0,
      dedup_key: '',
    }
    const derived = deriveProjectAndRef(record, row.ts)
    if (!derived) continue
    try {
      upsertProject(database, derived.projectInsert)
      upsertProjectRef(database, derived.projectRefInsert)
      if (updateSessionProjectIds(database, row.id, derived.projectId, derived.projectRefId)) {
        refreshed += 1
      }
    } catch {
      // skip row on error
    }
  }
  return refreshed
}

/** Backfill project_id and project_ref_id for sessions that have none (e.g. ingested before project logic). */
export function backfillSessionProjects(db?: Db): number {
  const database = db ?? getDb()

  const rows = database
    .prepare(
      `SELECT id, ts, cwd, git_branch, git_commit
       FROM session
       WHERE project_id IS NULL`
    )
    .all() as Array<{
    id: string
    ts: number
    cwd: string | null
    git_branch: string | null
    git_commit: string | null
  }>

  let updated = 0
  for (const row of rows) {
    const record = {
      id: row.id,
      ts: row.ts,
      cwd: row.cwd,
      originator: null as string | null,
      cli_version: null as string | null,
      model_provider: null as string | null,
      git_branch: row.git_branch,
      git_commit: row.git_commit,
      source_file: '',
      source_line: 0,
      dedup_key: '',
    }
    const derived = deriveProjectAndRef(record, row.ts)
    if (!derived) continue
    try {
      upsertProject(database, derived.projectInsert)
      upsertProjectRef(database, derived.projectRefInsert)
      if (updateSessionProjectIds(database, row.id, derived.projectId, derived.projectRefId)) {
        updated += 1
      }
    } catch {
      // skip row on error
    }
  }
  return updated
}
