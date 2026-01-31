import fs from "fs";
import path from "path";
import type Database from "better-sqlite3";

const SCHEMA_VERSION = 1;

function loadSchemaSql(): string {
  const schemaPath = path.resolve(process.cwd(), "src", "lib", "db", "schema.sql");
  return fs.readFileSync(schemaPath, "utf8");
}

export function ensureMigrations(db: Database): void {
  const currentVersion = db.pragma("user_version", { simple: true }) as number;

  if (currentVersion === SCHEMA_VERSION) {
    return;
  }

  if (currentVersion > SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${currentVersion} is newer than supported ${SCHEMA_VERSION}.`
    );
  }

  const schemaSql = loadSchemaSql();
  db.exec(schemaSql);
  db.pragma(`user_version = ${SCHEMA_VERSION}`);
}
