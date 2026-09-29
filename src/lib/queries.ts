import { getDb, ensureDemoSeededIfNeeded } from "./bootstrap";
import type { Defect, QueueItem, SuiteRun, WrikeLink } from "./types";

function parseJsonArray(v: string | null | undefined): string[] {
  if (!v) return [];
  try {
    const x = JSON.parse(v);
    return Array.isArray(x) ? x.map(String) : [];
  } catch {
    return [];
  }
}

function mapRun(r: Record<string, unknown>): SuiteRun {
  return r as unknown as SuiteRun;
}

function mapDefect(r: Record<string, unknown>): Defect {
  return {
    ...(r as unknown as Defect),
    market: parseJsonArray(r.market as string),
    device: parseJsonArray(r.device as string),
    evidence_urls: parseJsonArray(r.evidence_urls as string),
  };
}

function mapWrike(r: Record<string, unknown>): WrikeLink {
  return {
    ...(r as unknown as WrikeLink),
    assignee_ids: parseJsonArray(r.assignee_ids as string),
    assignee_names: parseJsonArray(r.assignee_names as string),
  };
}

export function listRuns(opts: {
  status?: string;
  suite?: string;
  starter?: string;
  from?: string;
  to?: string;
  has_wrike?: string;
  regression_only?: string;
  cursor?: string;
  limit?: number;
}): { items: SuiteRun[]; next_cursor: string | null } {
  ensureDemoSeededIfNeeded();
  const db = getDb();
  const limit = Math.min(opts.limit ?? 50, 100);
  const where: string[] = ["1=1"];
  const params: unknown[] = [];
  if (opts.status) {
    where.push("status = ?");
    params.push(opts.status);
  }
  if (opts.suite) {
    where.push("(suite_key = ? OR suite_name LIKE ?)");
    params.push(opts.suite, `%${opts.suite}%`);
  }
  if (opts.starter) {
    where.push("started_by_name LIKE ?");
    params.push(`%${opts.starter}%`);
  }
  if (opts.from) {
    where.push("COALESCE(started_at, queued_at) >= ?");
    params.push(opts.from);
  }
  if (opts.to) {
    where.push("COALESCE(started_at, queued_at) <= ?");
    params.push(opts.to);
  }
  if (opts.has_wrike === "1" || opts.has_wrike === "true") {
    where.push("wrike_task_id IS NOT NULL AND wrike_task_id != ''");
  }
  if (opts.regression_only === "1" || opts.regression_only === "true") {
    where.push(
      `EXISTS (SELECT 1 FROM defects d WHERE d.suite_run_id = suite_runs.id AND d.regression_count > 1)`,
    );
  }
  if (opts.cursor) {
    where.push("COALESCE(started_at, queued_at, created_at) < ?");
    params.push(opts.cursor);
  }
  const sql = `SELECT suite_runs.*,
      (SELECT COUNT(*) FROM defects d WHERE d.suite_run_id = suite_runs.id AND d.grade IN ('FAIL','DEFECT')) AS defect_count,
      (SELECT COALESCE(MAX(d.regression_count), 0) FROM defects d WHERE d.suite_run_id = suite_runs.id) AS regression_max,
      (SELECT d.went_live_at FROM defects d WHERE d.suite_run_id = suite_runs.id AND d.went_live_at IS NOT NULL ORDER BY d.went_live_at DESC LIMIT 1) AS went_live_at,
      (SELECT d.fixed_by_name FROM defects d WHERE d.suite_run_id = suite_runs.id AND d.fixed_by_name IS NOT NULL LIMIT 1) AS fixed_by_name,
      (SELECT w.unfiled_reason FROM wrike_links w WHERE w.subject_type='defect' AND w.subject_id IN (SELECT d.id FROM defects d WHERE d.suite_run_id = suite_runs.id) AND w.unfiled_reason IS NOT NULL LIMIT 1) AS unfiled_reason
    FROM suite_runs WHERE ${where.join(" AND ")}
    ORDER BY COALESCE(started_at, queued_at, created_at) DESC LIMIT ?`;
  params.push(limit + 1);
  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  const items = rows.slice(0, limit).map((r) => {
    const run = mapRun(r);
    run.defect_count = Number(r.defect_count || 0);
    run.regression_max = Number(r.regression_max || 0);
    run.went_live_at = (r.went_live_at as string) || null;
    run.fixed_by_name = (r.fixed_by_name as string) || null;
    run.unfiled_reason = (r.unfiled_reason as string) || null;
    return run;
  });
  const next =
    rows.length > limit
      ? (items[items.length - 1].started_at ||
          items[items.length - 1].queued_at ||
          items[items.length - 1].created_at)
      : null;
  return { items, next_cursor: next };
}

export function getRun(id: string) {
  ensureDemoSeededIfNeeded();
  const db = getDb();
  const run = db.prepare("SELECT * FROM suite_runs WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!run) return null;
  const defects = (
    db.prepare("SELECT * FROM defects WHERE suite_run_id = ?").all(id) as Record<
      string,
      unknown
    >[]
  ).map(mapDefect);
  for (const d of defects) {
    d.wrike = (
      db
        .prepare("SELECT * FROM wrike_links WHERE subject_type='defect' AND subject_id = ?")
        .all(d.id) as Record<string, unknown>[]
    ).map(mapWrike);
    if (d.fingerprint) {
      const last = db
        .prepare(
          `SELECT suite_run_id AS run_id, seen_at FROM regression_occurrences
           WHERE fingerprint = ? ORDER BY seen_at DESC LIMIT 10`,
        )
        .all(d.fingerprint) as { run_id: string; seen_at: string }[];
      d.regression = { count: d.regression_count, last };
    }
  }
  const wrike = (
    db
      .prepare("SELECT * FROM wrike_links WHERE subject_type='run' AND subject_id = ?")
      .all(id) as Record<string, unknown>[]
  ).map(mapWrike);
  const events_tail = db
    .prepare(
      `SELECT event_id, run_id, type, ts, seq, payload, received_at FROM run_events
       WHERE run_id = ? ORDER BY seq DESC LIMIT 50`,
    )
    .all(id);
  return { run: mapRun(run), cases: [], defects, wrike, events_tail };
}

export function getQueue(): { running: SuiteRun | null; items: QueueItem[] } {
  ensureDemoSeededIfNeeded();
  const db = getDb();
  const running = db
    .prepare(
      `SELECT * FROM suite_runs WHERE status='running'
       ORDER BY started_at DESC LIMIT 1`,
    )
    .get() as Record<string, unknown> | undefined;
  const items = db
    .prepare(
      `SELECT * FROM queue_items WHERE status IN ('waiting','acked')
       ORDER BY position ASC, priority DESC`,
    )
    .all() as QueueItem[];
  return { running: running ? mapRun(running) : null, items };
}

export function listDefects(opts: { run_id?: string; status?: string; area?: string }): {
  items: Defect[];
} {
  ensureDemoSeededIfNeeded();
  const db = getDb();
  const where: string[] = ["1=1"];
  const params: unknown[] = [];
  if (opts.run_id) {
    where.push("suite_run_id = ?");
    params.push(opts.run_id);
  }
  if (opts.status) {
    where.push("status = ?");
    params.push(opts.status);
  }
  if (opts.area) {
    where.push("area = ?");
    params.push(opts.area);
  }
  const rows = db
    .prepare(`SELECT * FROM defects WHERE ${where.join(" AND ")} ORDER BY found_at DESC`)
    .all(...params) as Record<string, unknown>[];
  const items = rows.map(mapDefect);
  for (const d of items) {
    d.wrike = (
      db
        .prepare("SELECT * FROM wrike_links WHERE subject_type='defect' AND subject_id = ?")
        .all(d.id) as Record<string, unknown>[]
    ).map(mapWrike);
    if (d.fingerprint) {
      const last = db
        .prepare(
          `SELECT suite_run_id AS run_id, seen_at FROM regression_occurrences
           WHERE fingerprint = ? ORDER BY seen_at DESC LIMIT 10`,
        )
        .all(d.fingerprint) as { run_id: string; seen_at: string }[];
      d.regression = { count: d.regression_count, last };
    }
  }
  return { items };
}

export function kpis() {
  ensureDemoSeededIfNeeded();
  const db = getDb();
  const running = (
    db.prepare(`SELECT COUNT(*) AS c FROM suite_runs WHERE status='running'`).get() as {
      c: number;
    }
  ).c;
  const queue = (
    db.prepare(`SELECT COUNT(*) AS c FROM queue_items WHERE status IN ('waiting','acked')`).get() as {
      c: number;
    }
  ).c;
  const openDefects = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM defects WHERE status='open' AND grade IN ('FAIL','DEFECT')`,
      )
      .get() as { c: number }
  ).c;
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const regressions7d = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM regression_occurrences WHERE seen_at >= ?`,
      )
      .get(since) as { c: number }
  ).c;
  return { running, queue, openDefects, regressions7d };
}

export function eventsAfter(seq: number, limit = 100) {
  ensureDemoSeededIfNeeded();
  const db = getDb();
  return db
    .prepare(
      `SELECT event_id, run_id, type, ts, seq, payload FROM run_events
       WHERE seq > ? ORDER BY seq ASC LIMIT ?`,
    )
    .all(seq, limit) as {
    event_id: string;
    run_id: string;
    type: string;
    ts: string;
    seq: number;
    payload: string;
  }[];
}

export function getSuite(suiteKey: string) {
  ensureDemoSeededIfNeeded();
  const db = getDb();
  const runs = (
    db
      .prepare(
        `SELECT * FROM suite_runs WHERE suite_key = ? ORDER BY COALESCE(started_at, queued_at) DESC`,
      )
      .all(suiteKey) as Record<string, unknown>[]
  ).map(mapRun);
  const starters = db
    .prepare(
      `SELECT started_by_name AS name, started_by_kind AS kind, COUNT(*) AS count
       FROM suite_runs WHERE suite_key = ? AND started_by_name IS NOT NULL
       GROUP BY started_by_name, started_by_kind ORDER BY count DESC LIMIT 3`,
    )
    .all(suiteKey);
  const passed = runs.filter((r) => r.status === "passed").length;
  const pass_rate_30d = runs.length ? Math.round((passed / runs.length) * 100) : 0;
  return {
    suite: {
      suite_key: suiteKey,
      name: runs[0]?.suite_name || suiteKey,
      runs_total: runs.length,
      last_run_at: runs[0]?.started_at || null,
      pass_rate_30d,
    },
    runs,
    regression_series: [] as { date: string; count: number }[],
    starters,
  };
}
