import type { Db } from '../index'

export interface SessionRecord {
  id: string
  ts: number
  cwd: string | null
  originator: string | null
  cli_version: string | null
  model_provider: string | null
  git_branch: string | null
  git_commit: string | null
  project_id?: string | null
  project_ref_id?: string | null
  source_file: string
  source_line: number
  dedup_key: string
}

type Stmt = ReturnType<Db['prepare']>
type Statements = {
  insert: Stmt
  getById: Stmt
  deleteById: Stmt
  updateProjectIds: Stmt
}

const statementCache = new WeakMap<Db, Statements>()

function getStatements(db: Db): Statements {
  const cached = statementCache.get(db)
  if (cached) {
    return cached
  }

  const insert = db.prepare(
    `INSERT INTO session (
      id, ts, cwd, originator, cli_version, model_provider, git_branch, git_commit,
      project_id, project_ref_id, source_file, source_line, dedup_key
    ) VALUES (
      @id, @ts, @cwd, @originator, @cli_version, @model_provider, @git_branch, @git_commit,
      @project_id, @project_ref_id, @source_file, @source_line, @dedup_key
    ) ON CONFLICT(dedup_key) DO NOTHING`
  )

  const getById = db.prepare(
    `SELECT id, ts, cwd, originator, cli_version, model_provider, git_branch, git_commit,
      project_id, project_ref_id, source_file, source_line, dedup_key
     FROM session
     WHERE id = ?`
  )

  const deleteById = db.prepare('DELETE FROM session WHERE id = ?')

  const updateProjectIds = db.prepare(
    'UPDATE session SET project_id = ?, project_ref_id = ? WHERE id = ?'
  )

  const statements: Statements = { insert, getById, deleteById, updateProjectIds }
  statementCache.set(db, statements)
  return statements
}

export function insertSession(db: Db, record: SessionRecord): boolean {
  const payload = {
    ...record,
    project_id: record.project_id ?? null,
    project_ref_id: record.project_ref_id ?? null,
  }
  const result = getStatements(db).insert.run(payload)
  return Number(result.changes ?? 0) > 0
}

export function getSessionById(db: Db, id: string): SessionRecord | null {
  const row = getStatements(db).getById.get(id) as SessionRecord | undefined
  return row ?? null
}

export function deleteSessionById(db: Db, id: string): boolean {
  const result = getStatements(db).deleteById.run(id)
  return Number(result.changes ?? 0) > 0
}

export function updateSessionProjectIds(
  db: Db,
  sessionId: string,
  projectId: string,
  projectRefId: string
): boolean {
  const result = getStatements(db).updateProjectIds.run(projectId, projectRefId, sessionId)
  return Number(result.changes ?? 0) > 0
}
