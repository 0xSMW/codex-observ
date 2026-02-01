import fs from 'fs'
import path from 'path'
import type { DatabaseSync } from 'node:sqlite'

const SCHEMA_VERSION = 1

function loadSchemaSql(): string {
  const schemaPath = path.resolve(process.cwd(), 'src', 'lib', 'db', 'schema.sql')
  return fs.readFileSync(schemaPath, 'utf8')
}

export function ensureMigrations(db: DatabaseSync): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined
  const currentVersion = row?.user_version ?? 0

  if (currentVersion === SCHEMA_VERSION) {
    return
  }

  if (currentVersion > SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${currentVersion} is newer than supported ${SCHEMA_VERSION}.`
    )
  }

  const schemaSql = loadSchemaSql()
  db.exec(schemaSql)
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
}
