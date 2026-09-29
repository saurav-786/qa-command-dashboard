import postgres from "postgres";
import fs from "fs";
import path from "path";

const globalForPg = globalThis as unknown as { __qaSql?: ReturnType<typeof postgres> };

export function getPg() {
  const url = process.env.DATABASE_URL;
  if (!url || !/^postgres(ql)?:\/\//i.test(url)) {
    throw new Error("DATABASE_URL must be a postgres connection string on Vercel");
  }
  if (!globalForPg.__qaSql) {
    globalForPg.__qaSql = postgres(url, {
      ssl: "require",
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return globalForPg.__qaSql;
}

export async function migratePg(): Promise<void> {
  const sql = getPg();
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  const file = path.join(process.cwd(), "db", "migrations", "001_init.postgres.sql");
  const applied = await sql<{ id: string }[]>`SELECT id FROM schema_migrations WHERE id = ${"001_init.postgres.sql"}`;
  if (applied.length) return;
  const body = fs.readFileSync(file, "utf8");
  // Run as one script; postgres.js supports simple exec via unsafe
  await sql.unsafe(body);
  await sql`
    INSERT INTO schema_migrations (id, applied_at)
    VALUES (${"001_init.postgres.sql"}, NOW())
    ON CONFLICT (id) DO NOTHING
  `;
}

export function isPostgres(): boolean {
  return !!process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL);
}
