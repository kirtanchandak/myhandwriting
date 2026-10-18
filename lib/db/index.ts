import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS fonts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  font_id TEXT NOT NULL REFERENCES fonts(id) ON DELETE CASCADE,
  hash TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  saved_at INTEGER NOT NULL,
  UNIQUE (font_id, hash)
);
CREATE TABLE IF NOT EXISTS glyphs (
  font_id TEXT NOT NULL REFERENCES fonts(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  ch TEXT NOT NULL,
  variant INTEGER NOT NULL,
  line_number INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  data BLOB NOT NULL,
  width_u REAL NOT NULL,
  height_u REAL NOT NULL,
  top_u REAL NOT NULL,
  excluded INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (font_id, id)
);
`;

let current: { file: string; db: Database.Database } | null = null;

export function databaseFile(): string {
  return process.env.DATABASE_PATH || path.join(process.cwd(), "data", "myhandwriting.sqlite");
}

export function getDb(): Database.Database {
  const file = databaseFile();
  if (current?.file === file) return current.db;
  current?.db.close();
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  current = { file, db };
  return db;
}

/** Closes the open connection. Tests use this before switching files. */
export function closeDb() {
  current?.db.close();
  current = null;
}
