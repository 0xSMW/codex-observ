import type Database from "better-sqlite3";

export interface IngestStateRecord {
  path: string;
  byte_offset: number;
  mtime_ms: number | null;
  updated_at: number;
}

type Statements = {
  getByPath: ReturnType<Database["prepare"]>;
  upsert: ReturnType<Database["prepare"]>;
  deleteByPath: ReturnType<Database["prepare"]>;
};

const statementCache = new WeakMap<Database, Statements>();

function getStatements(db: Database): Statements {
  const cached = statementCache.get(db);
  if (cached) {
    return cached;
  }

  const statements: Statements = {
    getByPath: db.prepare(
      "SELECT path, byte_offset, mtime_ms, updated_at FROM ingest_state WHERE path = ?"
    ),
    upsert: db.prepare(
      `INSERT INTO ingest_state (path, byte_offset, mtime_ms, updated_at)
       VALUES (@path, @byte_offset, @mtime_ms, @updated_at)
       ON CONFLICT(path) DO UPDATE SET
         byte_offset = excluded.byte_offset,
         mtime_ms = excluded.mtime_ms,
         updated_at = excluded.updated_at`
    ),
    deleteByPath: db.prepare("DELETE FROM ingest_state WHERE path = ?"),
  };

  statementCache.set(db, statements);
  return statements;
}

export function getIngestState(db: Database, path: string): IngestStateRecord | null {
  const row = getStatements(db).getByPath.get(path) as IngestStateRecord | undefined;
  return row ?? null;
}

export function setIngestState(
  db: Database,
  state: Omit<IngestStateRecord, "updated_at"> & { updated_at?: number }
): void {
  const now = state.updated_at ?? Date.now();
  getStatements(db).upsert.run({
    path: state.path,
    byte_offset: state.byte_offset,
    mtime_ms: state.mtime_ms,
    updated_at: now,
  });
}

export function deleteIngestState(db: Database, path: string): boolean {
  const result = getStatements(db).deleteByPath.run(path);
  return result.changes > 0;
}
