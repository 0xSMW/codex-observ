import fs from 'fs'
import os from 'os'
import path from 'path'
import { ingestAll, ingestIncremental } from '../src/lib/ingestion'
import { closeDb, getDb } from '../src/lib/db'

async function main(): Promise<void> {
  const repoRoot = process.cwd()
  const fixtureHome = path.join(repoRoot, 'src', 'lib', 'ingestion', '__fixtures__')
  const dbPath = path.join(os.tmpdir(), `codex-observ-smoke-${Date.now()}.db`)

  process.env.CODEX_OBSERV_DB_PATH = dbPath

  const allResult = await ingestAll(fixtureHome)
  const db = getDb()

  const sessionCount = db.prepare('SELECT COUNT(*) as count FROM session').get() as {
    count: number
  }
  const messageCount = db.prepare('SELECT COUNT(*) as count FROM message').get() as {
    count: number
  }
  const modelCallCount = db.prepare('SELECT COUNT(*) as count FROM model_call').get() as {
    count: number
  }

  console.log('[smoke] ingestAll result', allResult)
  console.log('[smoke] counts', {
    sessions: sessionCount.count,
    messages: messageCount.count,
    modelCalls: modelCallCount.count,
  })

  const incrementalResult = await ingestIncremental(fixtureHome)
  console.log('[smoke] ingestIncremental result', incrementalResult)

  closeDb()

  for (const suffix of ['', '-wal', '-shm']) {
    const target = `${dbPath}${suffix}`
    try {
      if (fs.existsSync(target)) {
        fs.unlinkSync(target)
      }
    } catch (error) {
      console.warn(`[smoke] failed to remove ${target}`, error)
    }
  }
}

main().catch((error) => {
  console.error('[smoke] failed', error)
  process.exitCode = 1
})
