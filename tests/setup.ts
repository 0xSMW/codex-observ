import fs from 'fs'
import os from 'os'
import path from 'path'
import { beforeAll, afterAll } from 'vitest'
import { ingestAll } from '../src/lib/ingestion'
import { closeDb } from '../src/lib/db'

const repoRoot = path.resolve(__dirname, '..')
const rawFixtures = path.join(repoRoot, 'src', 'lib', 'ingestion', '__fixtures__')

let testDbPath: string = ''
let testFixtureHome: string = ''
let setupDone = false

export function getTestDbPath(): string {
  return testDbPath
}

export function getTestFixtureHome(): string {
  return testFixtureHome
}

function prepareFixtureHome(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-observ-e2e-'))
  const sessionsDir = path.join(tmpDir, 'sessions')
  const logDir = path.join(tmpDir, 'log')

  fs.mkdirSync(sessionsDir, { recursive: true })
  fs.mkdirSync(logDir, { recursive: true })

  const sourceSessions = path.join(rawFixtures, 'sessions')
  if (fs.existsSync(sourceSessions)) {
    fs.cpSync(sourceSessions, path.join(tmpDir, 'sessions'), { recursive: true })
  }

  const sourceLog = path.join(rawFixtures, 'codex-tui.log')
  if (fs.existsSync(sourceLog)) {
    fs.copyFileSync(sourceLog, path.join(logDir, 'codex-tui.log'))
  }

  return tmpDir
}

function cleanupFixtureHome(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    // ignore
  }
}

beforeAll(async () => {
  if (setupDone) return
  setupDone = true

  testDbPath = path.join(os.tmpdir(), `codex-observ-e2e-${Date.now()}.db`)
  testFixtureHome = prepareFixtureHome()

  process.env.CODEX_OBSERV_DB_PATH = testDbPath
  process.env.CODEX_HOME = testFixtureHome

  const result = await ingestAll(testFixtureHome)
  if (result.errors.length > 0) {
    console.warn('[e2e setup] Ingestion errors:', result.errors.slice(0, 5))
  }
})

afterAll(() => {
  if (!setupDone) return
  closeDb()
  if (testFixtureHome) {
    cleanupFixtureHome(testFixtureHome)
  }
  if (testDbPath) {
    for (const suffix of ['', '-wal', '-shm']) {
      const target = `${testDbPath}${suffix}`
      try {
        if (fs.existsSync(target)) {
          fs.unlinkSync(target)
        }
      } catch {
        // ignore
      }
    }
  }
})
