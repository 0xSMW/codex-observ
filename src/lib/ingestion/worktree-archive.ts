import fs from 'fs'
import os from 'os'
import path from 'path'
import type { Db } from '../db'
import { insertWorktreeEvents, type WorktreeEventRecord } from '../db/queries/worktree-events'
import { generateDedupKey } from './dedup'

function resolveCodexHome(codexHome?: string): string {
  return codexHome || process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
}

function normalizeWorktreePath(value: string): string {
  const home = os.homedir()
  if (value.startsWith(home)) {
    return `~${value.slice(home.length)}`
  }
  return value
}

function listWorktreePaths(codexHome?: string): string[] {
  const root = path.join(resolveCodexHome(codexHome), 'worktrees')
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true })
    const results: string[] = []
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const idDir = path.join(root, entry.name)
      let inner: fs.Dirent[] = []
      try {
        inner = fs.readdirSync(idDir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const child of inner) {
        if (!child.isDirectory() || child.name.startsWith('.')) continue
        results.push(normalizeWorktreePath(path.join(idDir, child.name)))
      }
    }
    return results
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null ? (error as NodeJS.ErrnoException).code : null
    if (code === 'ENOENT') {
      return []
    }
    return []
  }
}

function getLatestWorktreeActions(
  db: Db
): Array<{ worktree_path: string; action: string; ts: number }> {
  const rows = db
    .prepare(
      `SELECT worktree_path, action, ts
       FROM (
         SELECT worktree_path,
           action,
           ts,
           ROW_NUMBER() OVER (PARTITION BY worktree_path ORDER BY ts DESC) AS rn
         FROM worktree_event
         WHERE worktree_path IS NOT NULL
       )
       WHERE rn = 1`
    )
    .all() as Array<{ worktree_path: string | null; action: string | null; ts: number | null }>

  return rows
    .filter((row) => row.worktree_path)
    .map((row) => ({
      worktree_path: String(row.worktree_path ?? ''),
      action: String(row.action ?? ''),
      ts: Number(row.ts ?? 0),
    }))
}

export function inferArchivedWorktrees(db: Db, codexHome?: string): number {
  const onDisk = new Set(listWorktreePaths(codexHome))
  const latest = getLatestWorktreeActions(db)

  const now = Date.now()
  const records: WorktreeEventRecord[] = []

  for (const entry of latest) {
    if (!entry.worktree_path) continue
    if (onDisk.has(entry.worktree_path)) continue

    const action = entry.action.toLowerCase()
    if (action === 'archived' || action === 'deleted') continue

    const payload = {
      path: entry.worktree_path,
      action: 'archived',
      lastSeenTs: entry.ts,
      archivedAt: now,
    }
    const dedupKey = generateDedupKey('worktree_archive', 0, payload)
    records.push({
      id: dedupKey,
      ts: now,
      action: 'archived',
      worktree_path: entry.worktree_path,
      repo_root: entry.worktree_path,
      branch: null,
      status: 'ok',
      error: null,
      app_session_id: null,
      source_log_id: null,
      dedup_key: dedupKey,
    })
  }

  if (records.length === 0) {
    return 0
  }

  return insertWorktreeEvents(db, records)
}
