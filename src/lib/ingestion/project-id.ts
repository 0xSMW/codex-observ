import path from 'path'
import { hashPayload } from './dedup'
import { detectGitRemote, repoNameFromRemote } from './git-utils'
import type { SessionRecord } from '../db/queries/sessions'
import type { ProjectInsert, ProjectRefInsert } from '../db/queries/projects'

/**
 * Detects if a path is a conductor workspace and extracts the project name.
 * Conductor structure: /path/to/conductor/workspaces/{project-name}/{workspace-name}
 * Returns the project name if detected, null otherwise.
 */
function detectConductorProject(cwd: string | null): string | null {
  if (!cwd) return null

  const normalized = cwd.replace(/\\/g, '/')
  const match = normalized.match(/\/conductor\/(?:workspaces|archived-contexts)\/([^/]+)\//)
  if (match && match[1]) {
    return match[1]
  }
  return null
}

function projectName(
  cwd: string | null,
  gitRemote: string | null,
  metaProject?: string | null,
  metaRepo?: string | null
): string {
  // 1. Use metadata if available
  const fromMeta = metaProject ?? metaRepo
  if (fromMeta && typeof fromMeta === 'string' && fromMeta.trim().length > 0) {
    return fromMeta.trim()
  }

  // 2. If we have a git remote, extract repo name from URL
  if (gitRemote) {
    const repoName = repoNameFromRemote(gitRemote)
    if (repoName) return repoName
  }

  // 3. Check for conductor workspace pattern
  const conductorProject = detectConductorProject(cwd)
  if (conductorProject) return conductorProject

  // 4. Fall back to basename of cwd
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

  // Try to detect git remote from filesystem or use metadata if available in future
  // Note: we detect from fs every time for now; cached via simple memo in future if slow
  const gitRemote = cwd ? detectGitRemote(cwd) : null

  // Derive project name (uses git remote, conductor pattern, or basename)
  const name = projectName(cwd, gitRemote)
  const rootPath = cwd
  const conductorProject = detectConductorProject(cwd)

  // Project identity: same id for all workspaces of the same repo
  // 1. Git remote → one project per repo (works across checkouts/worktrees)
  // 2. Conductor path but no git (e.g. archived) → one project per conductor folder
  // 3. Else → one project per path
  const projectId = gitRemote
    ? hashPayload({ git_remote: gitRemote }, 16)
    : conductorProject
      ? hashPayload({ conductor_project: conductorProject }, 16)
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
