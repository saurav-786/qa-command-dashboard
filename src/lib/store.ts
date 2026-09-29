/**
 * Async data access used by API routes + RSC pages.
 * - Local: better-sqlite3 (via existing sync helpers)
 * - Vercel: Postgres (DATABASE_URL)
 */
import { getDb, isDemoMode, migrate } from "./db";
import { getPg, isPostgres, migratePg } from "./db-pg";
import { ensureDemoSeeded } from "./seed";
import type { Defect, QueueItem, SuiteRun, WrikeLink } from "./types";

let demoReady = false;

export async function ensureReady(): Promise<void> {
  if (isPostgres()) {
    await migratePg();
    return;
  }
  migrate();
  if (isDemoMode() && !demoReady) {
    ensureDemoSeeded();
    demoReady = true;
  }
}

function parseJsonArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") {
    try {
      const x = JSON.parse(v);
      return Array.isArray(x) ? x.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapRun(r: Record<string, unknown>): SuiteRun {
  return {
    ...(r as unknown as SuiteRun),
    queued_at: r.queued_at ? String(r.queued_at) : null,
    started_at: r.started_at ? String(r.started_at) : null,
    finished_at: r.finished_at ? String(r.finished_at) : null,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    defect_count: r.defect_count != null ? Number(r.defect_count) : undefined,
    regression_max: r.regression_max != null ? Number(r.regression_max) : undefined,
    went_live_at: r.went_live_at ? String(r.went_live_at) : null,
    fixed_by_name: (r.fixed_by_name as string) || null,
    unfiled_reason: (r.unfiled_reason as string) || null,
  };
}

function mapDefect(r: Record<string, unknown>): Defect {
  return {
    ...(r as unknown as Defect),
    market: parseJsonArray(r.market),
    device: parseJsonArray(r.device),
    evidence_urls: parseJsonArray(r.evidence_urls),
    found_at: r.found_at ? String(r.found_at) : null,
    fixed_at: r.fixed_at ? String(r.fixed_at) : null,
    went_live_at: r.went_live_at ? String(r.went_live_at) : null,
  };
}

function mapWrike(r: Record<string, unknown>): WrikeLink {
  return {
    ...(r as unknown as WrikeLink),
    assignee_ids: parseJsonArray(r.assignee_ids),
    assignee_names: parseJsonArray(r.assignee_names),
  };
}

export async function listRuns(opts: {
  status?: string;
  suite?: string;
  starter?: string;
  from?: string;
  to?: string;
  has_wrike?: string;
  regression_only?: string;
  cursor?: string;
  limit?: number;
}): Promise<{ items: SuiteRun[]; next_cursor: string | null }> {
  await ensureReady();
  const limit = Math.min(opts.limit ?? 50, 100);

  if (!isPostgres()) {
    const { listRuns: syncList } = await import("./queries");
    return syncList(opts);
  }

  const sql = getPg();
  const where: string[] = ["1=1"];
  const params: unknown[] = [];
  let i = 1;
  const add = (clause: string, value: unknown) => {
    where.push(clause.replace("?", `$${i++}`));
    params.push(value);
  };
  if (opts.status) add("status = ?", opts.status);
  if (opts.suite) {
    where.push(`(suite_key = $${i} OR suite_name ILIKE $${i + 1})`);
    params.push(opts.suite, `%${opts.suite}%`);
    i += 2;
  }
  if (opts.starter) add("started_by_name ILIKE ?", `%${opts.starter}%`);
  if (opts.from) add("COALESCE(started_at, queued_at) >= ?", opts.from);
  if (opts.to) add("COALESCE(started_at, queued_at) <= ?", opts.to);
  if (opts.has_wrike === "1" || opts.has_wrike === "true") {
    where.push("wrike_task_id IS NOT NULL AND wrike_task_id != ''");
  }
  if (opts.regression_only === "1" || opts.regression_only === "true") {
    where.push(
      `EXISTS (SELECT 1 FROM defects d WHERE d.suite_run_id = suite_runs.id AND d.regression_count > 1)`,
    );
  }
  if (opts.cursor) add("COALESCE(started_at, queued_at, created_at) < ?", opts.cursor);
  params.push(limit + 1);
  const q = `
    SELECT suite_runs.*,
      (SELECT COUNT(*) FROM defects d WHERE d.suite_run_id = suite_runs.id AND d.grade IN ('FAIL','DEFECT')) AS defect_count,
      (SELECT COALESCE(MAX(d.regression_count), 0) FROM defects d WHERE d.suite_run_id = suite_runs.id) AS regression_max,
      (SELECT d.went_live_at FROM defects d WHERE d.suite_run_id = suite_runs.id AND d.went_live_at IS NOT NULL ORDER BY d.went_live_at DESC LIMIT 1) AS went_live_at,
      (SELECT d.fixed_by_name FROM defects d WHERE d.suite_run_id = suite_runs.id AND d.fixed_by_name IS NOT NULL LIMIT 1) AS fixed_by_name,
      (SELECT w.unfiled_reason FROM wrike_links w WHERE w.subject_type='defect' AND w.subject_id IN (SELECT d.id FROM defects d WHERE d.suite_run_id = suite_runs.id) AND w.unfiled_reason IS NOT NULL LIMIT 1) AS unfiled_reason
    FROM suite_runs
    WHERE ${where.join(" AND ")}
    ORDER BY COALESCE(started_at, queued_at, created_at) DESC NULLS LAST
    LIMIT $${i}
  `;
  const rows = (await sql.unsafe(q, params as never[])) as Record<string, unknown>[];
  const items = rows.slice(0, limit).map(mapRun);
  const next =
    rows.length > limit
      ? items[items.length - 1].started_at ||
        items[items.length - 1].queued_at ||
        items[items.length - 1].created_at
      : null;
  return { items, next_cursor: next };
}

export async function getQueue(): Promise<{
  running: SuiteRun | null;
  items: QueueItem[];
}> {
  await ensureReady();
  if (!isPostgres()) {
    const q = await import("./queries");
    return q.getQueue();
  }
  const sql = getPg();
  const runningRows = await sql<Record<string, unknown>[]>`
    SELECT * FROM suite_runs WHERE status = 'running'
    ORDER BY started_at DESC NULLS LAST LIMIT 1
  `;
  const items = (await sql`
    SELECT * FROM queue_items WHERE status IN ('waiting','acked')
    ORDER BY position ASC, priority DESC
  `) as unknown as QueueItem[];
  return {
    running: runningRows[0] ? mapRun(runningRows[0]) : null,
    items,
  };
}

export async function kpis() {
  await ensureReady();
  if (!isPostgres()) {
    const q = await import("./queries");
    return q.kpis();
  }
  const sql = getPg();
  const [running] = await sql<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM suite_runs WHERE status='running'`;
  const [queue] = await sql<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM queue_items WHERE status IN ('waiting','acked')`;
  const [openDefects] = await sql<{ c: number }[]>`
    SELECT COUNT(*)::int AS c FROM defects WHERE status='open' AND grade IN ('FAIL','DEFECT')
  `;
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const [regressions7d] = await sql<{ c: number }[]>`
    SELECT COUNT(*)::int AS c FROM regression_occurrences WHERE seen_at >= ${since}
  `;
  return {
    running: running.c,
    queue: queue.c,
    openDefects: openDefects.c,
    regressions7d: regressions7d.c,
  };
}

export async function getRun(id: string) {
  await ensureReady();
  if (!isPostgres()) {
    const q = await import("./queries");
    return q.getRun(id);
  }
  const sql = getPg();
  const runs = await sql<Record<string, unknown>[]>`SELECT * FROM suite_runs WHERE id = ${id}`;
  if (!runs[0]) return null;
  const defectRows = await sql<Record<string, unknown>[]>`SELECT * FROM defects WHERE suite_run_id = ${id}`;
  const defects = defectRows.map(mapDefect);
  for (const d of defects) {
    d.wrike = (
      await sql<Record<string, unknown>[]>`
        SELECT * FROM wrike_links WHERE subject_type='defect' AND subject_id = ${d.id}
      `
    ).map(mapWrike);
    if (d.fingerprint) {
      const last = await sql<{ run_id: string; seen_at: string }[]>`
        SELECT suite_run_id AS run_id, seen_at::text FROM regression_occurrences
        WHERE fingerprint = ${d.fingerprint} ORDER BY seen_at DESC LIMIT 10
      `;
      d.regression = { count: d.regression_count, last };
    }
  }
  const wrike = (
    await sql<Record<string, unknown>[]>`
      SELECT * FROM wrike_links WHERE subject_type='run' AND subject_id = ${id}
    `
  ).map(mapWrike);
  const events_tail = await sql`
    SELECT event_id, run_id, type, ts, seq, payload, received_at FROM run_events
    WHERE run_id = ${id} ORDER BY seq DESC LIMIT 50
  `;
  return { run: mapRun(runs[0]), cases: [], defects, wrike, events_tail };
}

export async function listDefects(opts: {
  run_id?: string;
  status?: string;
  area?: string;
}) {
  await ensureReady();
  if (!isPostgres()) {
    const q = await import("./queries");
    return q.listDefects(opts);
  }
  const sql = getPg();
  let rows: Record<string, unknown>[];
  if (opts.run_id) {
    rows = await sql`SELECT * FROM defects WHERE suite_run_id = ${opts.run_id} ORDER BY found_at DESC NULLS LAST`;
  } else if (opts.status) {
    rows = await sql`SELECT * FROM defects WHERE status = ${opts.status} ORDER BY found_at DESC NULLS LAST`;
  } else {
    rows = await sql`SELECT * FROM defects ORDER BY found_at DESC NULLS LAST LIMIT 200`;
  }
  if (opts.area) rows = rows.filter((r) => r.area === opts.area);
  const items = rows.map(mapDefect);
  for (const d of items) {
    d.wrike = (
      await sql<Record<string, unknown>[]>`
        SELECT * FROM wrike_links WHERE subject_type='defect' AND subject_id = ${d.id}
      `
    ).map(mapWrike);
    if (d.fingerprint) {
      const last = await sql<{ run_id: string; seen_at: string }[]>`
        SELECT suite_run_id AS run_id, seen_at::text FROM regression_occurrences
        WHERE fingerprint = ${d.fingerprint} ORDER BY seen_at DESC LIMIT 10
      `;
      d.regression = { count: d.regression_count, last };
    }
  }
  return { items };
}

export async function getSuite(suiteKey: string) {
  await ensureReady();
  if (!isPostgres()) {
    const q = await import("./queries");
    return q.getSuite(suiteKey);
  }
  const sql = getPg();
  const runRows = await sql<Record<string, unknown>[]>`
    SELECT * FROM suite_runs WHERE suite_key = ${suiteKey}
    ORDER BY COALESCE(started_at, queued_at) DESC NULLS LAST
  `;
  const runs = runRows.map(mapRun);
  const starters = await sql`
    SELECT started_by_name AS name, started_by_kind AS kind, COUNT(*)::int AS count
    FROM suite_runs WHERE suite_key = ${suiteKey} AND started_by_name IS NOT NULL
    GROUP BY started_by_name, started_by_kind ORDER BY count DESC LIMIT 3
  `;
  const passed = runs.filter((r) => r.status === "passed").length;
  return {
    suite: {
      suite_key: suiteKey,
      name: runs[0]?.suite_name || suiteKey,
      runs_total: runs.length,
      last_run_at: runs[0]?.started_at || null,
      pass_rate_30d: runs.length ? Math.round((passed / runs.length) * 100) : 0,
    },
    runs,
    regression_series: [] as { date: string; count: number }[],
    starters,
  };
}

export async function eventsAfter(seq: number, limit = 100) {
  await ensureReady();
  if (!isPostgres()) {
    const q = await import("./queries");
    return q.eventsAfter(seq, limit);
  }
  const sql = getPg();
  const rows = await sql<{
    event_id: string;
    run_id: string;
    type: string;
    ts: string;
    seq: number;
    payload: unknown;
  }[]>`
    SELECT event_id, run_id, type, ts::text, seq, payload FROM run_events
    WHERE seq > ${seq} ORDER BY seq ASC LIMIT ${limit}
  `;
  return rows.map((r) => ({
    ...r,
    payload: typeof r.payload === "string" ? r.payload : JSON.stringify(r.payload ?? {}),
  }));
}

export async function nextEventSeq(): Promise<number> {
  await ensureReady();
  if (!isPostgres()) {
    const { nextEventSeq: n } = await import("./db");
    return n(getDb());
  }
  const sql = getPg();
  const [row] = await sql<{ m: number }[]>`SELECT COALESCE(MAX(seq), 0)::int AS m FROM run_events`;
  return row.m + 1;
}
