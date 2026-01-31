import type Database from "better-sqlite3";

export interface SessionRecord {
  id: string;
  ts: number;
  cwd: string | null;
  originator: string | null;
  cli_version: string | null;
  model_provider: string | null;
  git_branch: string | null;
  git_commit: string | null;
  source_file: string;
  source_line: number;
  dedup_key: string;
}

type Statements = {
  insert: ReturnType<Database["prepare"]>;
  getById: ReturnType<Database["prepare"]>;
  deleteById: ReturnType<Database["prepare"]>;
};

const statementCache = new WeakMap<Database, Statements>();

function getStatements(db: Database): Statements {
  const cached = statementCache.get(db);
  if (cached) {
    return cached;
  }

  const insert = db.prepare(
    `INSERT INTO session (
      id, ts, cwd, originator, cli_version, model_provider, git_branch, git_commit,
      source_file, source_line, dedup_key
    ) VALUES (
      @id, @ts, @cwd, @originator, @cli_version, @model_provider, @git_branch, @git_commit,
      @source_file, @source_line, @dedup_key
    ) ON CONFLICT(dedup_key) DO NOTHING`
  );

  const getById = db.prepare(
    `SELECT id, ts, cwd, originator, cli_version, model_provider, git_branch, git_commit,
      source_file, source_line, dedup_key
     FROM session
     WHERE id = ?`
  );

  const deleteById = db.prepare("DELETE FROM session WHERE id = ?");

  const statements: Statements = { insert, getById, deleteById };
  statementCache.set(db, statements);
  return statements;
}

export function insertSession(db: Database, record: SessionRecord): boolean {
  const result = getStatements(db).insert.run(record);
  return result.changes > 0;
}

export function getSessionById(db: Database, id: string): SessionRecord | null {
  const row = getStatements(db).getById.get(id) as SessionRecord | undefined;
  return row ?? null;
}

export function deleteSessionById(db: Database, id: string): boolean {
  const result = getStatements(db).deleteById.run(id);
  return result.changes > 0;
}
