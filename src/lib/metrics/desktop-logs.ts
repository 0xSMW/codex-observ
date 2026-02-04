import { toNumber } from '@/lib/utils'
import { getDatabase, tableExists } from './db'

export function getDesktopLogStatus(): { hasLogs: boolean; total: number } {
  const db = getDatabase()
  if (!tableExists(db, 'desktop_log_event')) {
    return { hasLogs: false, total: 0 }
  }

  const row = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM desktop_log_event
       WHERE message IS NOT NULL AND message != ''`
    )
    .get() as Record<string, unknown> | undefined

  const total = toNumber(row?.total)
  return { hasLogs: total > 0, total }
}
