import type Database from "better-sqlite3";

export type MessageRole = "user" | "assistant" | "system";

export interface MessageRecord {
  id: string;
  session_id: string;
  role: MessageRole;
  ts: number;
  content: string | null;
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
    `INSERT INTO message (
      id, session_id, role, ts, content, source_file, source_line, dedup_key
    ) VALUES (
      @id, @session_id, @role, @ts, @content, @source_file, @source_line, @dedup_key
    ) ON CONFLICT(dedup_key) DO NOTHING`
  );

  const getById = db.prepare(
    `SELECT id, session_id, role, ts, content, source_file, source_line, dedup_key
     FROM message
     WHERE id = ?`
  );

  const deleteById = db.prepare("DELETE FROM message WHERE id = ?");

  const statements: Statements = { insert, getById, deleteById };
  statementCache.set(db, statements);
  return statements;
}

export function insertMessage(db: Database, record: MessageRecord): boolean {
  const result = getStatements(db).insert.run(record);
  return result.changes > 0;
}

export function getMessageById(db: Database, id: string): MessageRecord | null {
  const row = getStatements(db).getById.get(id) as MessageRecord | undefined;
  return row ?? null;
}

export function deleteMessageById(db: Database, id: string): boolean {
  const result = getStatements(db).deleteById.run(id);
  return result.changes > 0;
}
