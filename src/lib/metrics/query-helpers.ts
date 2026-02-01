import { getDatabase, tableExists } from './db'

type Db = ReturnType<typeof getDatabase>

export function safeGet<T>(table: string, query: (db: Db) => T | undefined, fallback: T): T {
  const db = getDatabase()
  if (!tableExists(db, table)) {
    return fallback
  }
  return query(db) ?? fallback
}

export function safeAll<T>(table: string, query: (db: Db) => T[], fallback: T[] = []): T[] {
  const db = getDatabase()
  if (!tableExists(db, table)) {
    return fallback
  }
  return query(db)
}
