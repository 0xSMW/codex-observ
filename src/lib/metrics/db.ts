import { getDb } from '@/lib/db';

type Db = ReturnType<typeof getDb>;

export function getDatabase(): Db {
  return getDb();
}

export function tableExists(db: Db, table: string): boolean {
  try {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table) as { name?: string } | undefined;
    return Boolean(row?.name);
  } catch {
    return false;
  }
}

export function requireTables(db: Db, tables: string[]): boolean {
  for (const table of tables) {
    if (!tableExists(db, table)) {
      return false;
    }
  }
  return true;
}
