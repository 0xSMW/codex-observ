import path from 'path'
import { hashPayload } from './dedup'
import { detectGitRemote } from './git-utils'
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

  // Try to detect git remote from filesystem or use metadata if available in future
  // Note: we detect from fs every time for now; cached via simple memo in future if slow
  const gitRemote = cwd ? detectGitRemote(cwd) : null

  // If we have a git remote, use it as the primary identity for the project
  // This links multiple checkouts/worktrees of the same repo into one project
  const projectId = gitRemote
    ? hashPayload({ git_remote: gitRemote }, 16)
    : hashPayload({ name, root_path: rootPath }, 16)

  const branch = record.git_branch ?? null
  const commit = record.git_commit ?? null

  // A project ref (worktree) is specific to the local checkout path and branch
  const projectRefId = hashPayload({ project_id: projectId, branch, cwd }, 16)

  const projectInsert: ProjectInsert = {
    id: projectId,
    name,
    root_path: rootPath,
    git_remote: gitRemote,
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
