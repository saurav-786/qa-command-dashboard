import fs from "fs";
import path from "path";
import { isPostgres } from "./db-pg";

type SqliteDb = import("better-sqlite3").Database;

const globalForDb = globalThis as unknown as { __qaDb?: SqliteDb };

function dbPath(): string {
  if (process.env.DATABASE_URL?.startsWith("file:")) {
    return process.env.DATABASE_URL.replace(/^file:/, "");
  }
  if (process.env.SQLITE_PATH) return process.env.SQLITE_PATH;
  return path.join(process.cwd(), "data", "qa-command.sqlite");
}

export function getDb(): SqliteDb {
  if (isPostgres()) {
    throw new Error("getDb() is SQLite-only; use Postgres helpers when DATABASE_URL is set");
  }
  if (globalForDb.__qaDb) return globalForDb.__qaDb;
  // Lazy require so Vercel (Postgres) never loads the native module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3") as typeof import("better-sqlite3");
  const file = dbPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  globalForDb.__qaDb = db;
  return db;
}

export function migrate(db?: SqliteDb): void {
  if (isPostgres()) return;
  const database = db || getDb();
  const dir = path.join(process.cwd(), "db", "migrations");
  if (!fs.existsSync(dir)) return;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && !f.includes("postgres"))
    .sort();
  database.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);
  const applied = new Set(
    database
      .prepare("SELECT id FROM schema_migrations")
      .all()
      .map((r) => (r as { id: string }).id),
  );
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    database.exec(sql);
    database
      .prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")
      .run(file, new Date().toISOString());
  }
}

export function nextEventSeq(db: SqliteDb = getDb()): number {
  const row = db.prepare("SELECT COALESCE(MAX(seq), 0) AS m FROM run_events").get() as {
    m: number;
  };
  return row.m + 1;
}

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "1" || process.env.DEMO_MODE === "true";
}
