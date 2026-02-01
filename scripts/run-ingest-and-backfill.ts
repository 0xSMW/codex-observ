/**
 * Run incremental ingest from default Codex home (~/.codex) then backfill
 * project_id/project_ref_id for any sessions that don't have them.
 * Use: pnpm exec tsx scripts/run-ingest-and-backfill.ts
 * Use: pnpm exec tsx scripts/run-ingest-and-backfill.ts --full  (re-ingest all files)
 */
import { ingestAll, ingestIncremental } from '../src/lib/ingestion'
import {
  backfillSessionProjects,
  refreshProjectNames,
} from '../src/lib/ingestion/backfill-session-projects'
import { closeDb, getDb } from '../src/lib/db'

async function main(): Promise<void> {
  const full = process.argv.includes('--full')
  console.log(full ? 'Running full ingest...' : 'Running incremental ingest...')
  const result = full ? await ingestAll() : await ingestIncremental()
  console.log('Ingest result:', {
    filesProcessed: result.filesProcessed,
    linesIngested: result.linesIngested,
    errors: result.errors.length,
    durationMs: result.durationMs,
  })
  if (result.errors.length > 0 && result.errors.length <= 5) {
    result.errors.forEach((e) => console.warn('  ', e.file, e.line, e.error))
  } else if (result.errors.length > 5) {
    console.warn('  ...', result.errors.length, 'errors')
  }

  const db = getDb()
  const updated = backfillSessionProjects(db)
  console.log('Backfill: updated', updated, 'sessions with project_id/project_ref_id')

  const refreshed = refreshProjectNames(db)
  console.log('Refresh project names:', refreshed, 'project/project_ref rows upserted')

  closeDb()
  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
