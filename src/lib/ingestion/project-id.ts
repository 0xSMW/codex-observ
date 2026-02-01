import path from 'path'
import { hashPayload } from './dedup'
import type { SessionRecord } from '../db/queries/sessions'
import type { ProjectInsert, ProjectRefInsert } from '../db/queries/projects'

function projectName(
  cwd: string | null,
  metaProject?: string | null,
  metaRepo?: string | null
): string {
  const fromMeta = metaProject ?? metaRepo
  if (fromMeta && typeof fromMeta === 'string' && fromMeta.trim().length > 0) {
    return fromMeta.trim()
  }
  if (cwd && cwd.trim().length > 0) {
    return path.basename(cwd.trim())
  }
  return 'unknown'
}

export interface DerivedProject {
  projectId: string
  projectRefId: string
  projectInsert: ProjectInsert
  projectRefInsert: ProjectRefInsert
}

export function deriveProjectAndRef(record: SessionRecord, ts: number): DerivedProject | null {
  const cwd = record.cwd ?? null
  const name = projectName(cwd)
  const rootPath = cwd
  const projectId = hashPayload({ name, root_path: rootPath }, 16)
  const branch = record.git_branch ?? null
  const commit = record.git_commit ?? null
  const projectRefId = hashPayload({ project_id: projectId, branch, cwd }, 16)

  const projectInsert: ProjectInsert = {
    id: projectId,
    name,
    root_path: rootPath,
    git_remote: null,
    first_seen_ts: ts,
    last_seen_ts: ts,
  }

  const projectRefInsert: ProjectRefInsert = {
    id: projectRefId,
    project_id: projectId,
    branch,
    commit,
    cwd,
    first_seen_ts: ts,
    last_seen_ts: ts,
  }

  return {
    projectId,
    projectRefId,
    projectInsert,
    projectRefInsert,
  }
}
