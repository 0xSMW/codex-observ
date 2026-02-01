import type { Db } from '../index'
import type { ProjectRow, ProjectRefRow } from '../schema'

type Stmt = ReturnType<Db['prepare']>
type Statements = {
  upsertProject: Stmt
  upsertProjectRef: Stmt
}

const statementCache = new WeakMap<Db, Statements>()

function getStatements(db: Db): Statements {
  const cached = statementCache.get(db)
  if (cached) return cached

  const upsertProject = db.prepare(
    `INSERT INTO project (id, name, root_path, git_remote, first_seen_ts, last_seen_ts)
     VALUES (@id, @name, @root_path, @git_remote, @first_seen_ts, @last_seen_ts)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       root_path = COALESCE(excluded.root_path, project.root_path),
       git_remote = COALESCE(excluded.git_remote, project.git_remote),
       first_seen_ts = CASE WHEN project.first_seen_ts IS NULL OR project.first_seen_ts > excluded.first_seen_ts THEN excluded.first_seen_ts ELSE project.first_seen_ts END,
       last_seen_ts = CASE WHEN project.last_seen_ts IS NULL OR project.last_seen_ts < excluded.last_seen_ts THEN excluded.last_seen_ts ELSE project.last_seen_ts END`
  )

  const upsertProjectRef = db.prepare(
    `INSERT INTO project_ref (id, project_id, branch, "commit", cwd, first_seen_ts, last_seen_ts)
     VALUES (@id, @project_id, @branch, @commit_sha, @cwd, @first_seen_ts, @last_seen_ts)
     ON CONFLICT(id) DO UPDATE SET
       branch = COALESCE(excluded.branch, project_ref.branch),
       "commit" = COALESCE(excluded."commit", project_ref."commit"),
       cwd = COALESCE(excluded.cwd, project_ref.cwd),
       first_seen_ts = CASE WHEN project_ref.first_seen_ts IS NULL OR project_ref.first_seen_ts > excluded.first_seen_ts THEN excluded.first_seen_ts ELSE project_ref.first_seen_ts END,
       last_seen_ts = CASE WHEN project_ref.last_seen_ts IS NULL OR project_ref.last_seen_ts < excluded.last_seen_ts THEN excluded.last_seen_ts ELSE project_ref.last_seen_ts END`
  )

  const statements: Statements = { upsertProject, upsertProjectRef }
  statementCache.set(db, statements)
  return statements
}

export interface ProjectInsert {
  id: string
  name: string
  root_path: string | null
  git_remote: string | null
  first_seen_ts: number
  last_seen_ts: number
}

export interface ProjectRefInsert {
  id: string
  project_id: string
  branch: string | null
  commit: string | null
  cwd: string | null
  first_seen_ts: number
  last_seen_ts: number
}

export function upsertProject(db: Db, row: ProjectInsert): void {
  getStatements(db).upsertProject.run(row)
}

export function upsertProjectRef(db: Db, row: ProjectRefInsert): void {
  const { commit, ...rest } = row
  getStatements(db).upsertProjectRef.run({ ...rest, commit_sha: commit })
}

export function getProjectById(db: Db, id: string): ProjectRow | null {
  const row = db.prepare('SELECT * FROM project WHERE id = ?').get(id) as ProjectRow | undefined
  return row ?? null
}

export function getProjectRefById(db: Db, id: string): ProjectRefRow | null {
  const row = db.prepare('SELECT * FROM project_ref WHERE id = ?').get(id) as
    | ProjectRefRow
    | undefined
  return row ?? null
}
