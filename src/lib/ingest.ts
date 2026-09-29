import { getDb, nextEventSeq as nextSeqSqlite } from "./db";
import { getPg, isPostgres } from "./db-pg";
import { defectFingerprint } from "./fingerprint";
import { ensureReady, nextEventSeq } from "./store";
import type { IngestEvent } from "./types";
import type postgres from "postgres";

type Pg = postgres.Sql | postgres.TransactionSql;

export async function applyEvents(
  events: IngestEvent[],
): Promise<{ accepted: number; duplicates: number }> {
  await ensureReady();
  if (isPostgres()) return applyEventsPg(events);
  return applyEventsSqlite(events);
}

function applyEventsSqlite(events: IngestEvent[]): {
  accepted: number;
  duplicates: number;
} {
  const db = getDb();
  let accepted = 0;
  let duplicates = 0;
  const tx = db.transaction((batch: IngestEvent[]) => {
    for (const ev of batch) {
      const exists = db.prepare("SELECT 1 FROM run_events WHERE event_id = ?").get(ev.event_id);
      if (exists) {
        duplicates += 1;
        continue;
      }
      // Always server-assigned: producer seq (0/1/100) is not a global order and broke SSE resume + ORDER BY seq.
      const seq = nextSeqSqlite(db);
      db.prepare(
        `INSERT INTO run_events (event_id, run_id, type, ts, seq, payload, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        ev.event_id,
        ev.run_id,
        ev.type,
        ev.ts,
        seq,
        JSON.stringify(ev.payload || {}),
        new Date().toISOString(),
      );
      projectSqlite(db, ev);
      accepted += 1;
    }
  });
  tx(events);
  return { accepted, duplicates };
}

async function applyEventsPg(events: IngestEvent[]): Promise<{
  accepted: number;
  duplicates: number;
}> {
  const sql = getPg();
  let accepted = 0;
  let duplicates = 0;
  for (const ev of events) {
    // Insert + projection in ONE transaction. Before, the row was inserted first and projected afterwards; a timeout
    // or error in between left the event stored-but-unapplied, and every retry was then skipped as a "duplicate"
    // (29 Sep: all started/finished events of the QA bot's runs were lost this way).
    const inserted = await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(4242)`; // serialise seq assignment
      const existing = await tx`SELECT 1 FROM run_events WHERE event_id = ${ev.event_id}`;
      if (existing.length) return false;
      const [row] = await tx<{ m: number }[]>`SELECT COALESCE(MAX(seq), 0)::int AS m FROM run_events`;
      await tx`
        INSERT INTO run_events (event_id, run_id, type, ts, seq, payload, received_at)
        VALUES (
          ${ev.event_id}, ${ev.run_id}, ${ev.type}, ${ev.ts}, ${row.m + 1},
          ${tx.json((ev.payload || {}) as Parameters<typeof tx.json>[0])}, ${new Date().toISOString()}
        )
      `;
      await projectPg(ev, tx);
      return true;
    });
    if (inserted) accepted += 1;
    else duplicates += 1;
  }
  return { accepted, duplicates };
}

const TYPE_ORDER: Record<string, number> = { "suite.queued": 0, "suite.started": 1, "suite.progress": 2 };

/** Rebuild suite_runs / defects from the stored events (repairs events that were stored but never applied). */
export async function reprojectAll(): Promise<{ events: number }> {
  await ensureReady();
  if (!isPostgres()) {
    const db = getDb();
    const rows = db.prepare("SELECT event_id, run_id, type, ts, seq, payload FROM run_events").all() as Record<string, unknown>[];
    const evs = rows.map(toEvent).sort(byTime);
    db.transaction(() => evs.forEach((ev) => projectSqlite(db, ev)))();
    return { events: evs.length };
  }
  const sql = getPg();
  const rows = await sql<Record<string, unknown>[]>`SELECT event_id, run_id, type, ts, seq, payload FROM run_events`;
  const evs = rows.map(toEvent).sort(byTime);
  await sql.begin(async (tx) => {
    for (const ev of evs) await projectPg(ev, tx);
  });
  return { events: evs.length };
}

function toEvent(r: Record<string, unknown>): IngestEvent {
  const payload = typeof r.payload === "string" ? JSON.parse(r.payload as string) : (r.payload as Record<string, unknown>);
  const ts = r.ts instanceof Date ? r.ts.toISOString() : String(r.ts);
  return { event_id: String(r.event_id), run_id: String(r.run_id), type: String(r.type), ts, seq: Number(r.seq), payload: payload || {} };
}

function byTime(a: IngestEvent, b: IngestEvent): number {
  const t = Date.parse(a.ts) - Date.parse(b.ts);
  if (t) return t;
  const o = (TYPE_ORDER[a.type] ?? 3) - (TYPE_ORDER[b.type] ?? 3);
  return o || a.seq - b.seq;
}

function projectSqlite(db: ReturnType<typeof getDb>, ev: IngestEvent): void {
  const p = ev.payload || {};
  const now = new Date().toISOString();
  if (ev.type === "suite.queued") {
    upsertRunSqlite(db, {
      id: ev.run_id,
      status: "queued",
      queued_at: ev.ts,
      suite_key: String(p.suite_key || "unknown"),
      suite_name: String(p.suite_name || p.suite_key || "unknown"),
      kind: String(p.kind || "manual"),
      trigger: String(p.trigger || "bot"),
      source: String(p.source || "bot"),
      started_by_name: (p.started_by_name as string) || null,
      started_by_kind: (p.started_by_kind as string) || "bot",
      now,
    });
  }
  if (ev.type === "suite.started") {
    upsertRunSqlite(db, {
      id: ev.run_id,
      status: "running",
      started_at: ev.ts,
      suite_key: String(p.suite_key || "unknown"),
      suite_name: String(p.suite_name || "unknown"),
      kind: String(p.kind || "manual"),
      trigger: String(p.trigger || "bot"),
      source: String(p.source || "bot"),
      started_by_name: (p.started_by_name as string) || null,
      started_by_kind: (p.started_by_kind as string) || "bot",
      env: (p.env as string) || null,
      git_sha: (p.git_sha as string) || null,
      branch: (p.branch as string) || null,
      now,
    });
  }
  if (ev.type === "suite.progress") {
    db.prepare(
      `UPDATE suite_runs SET progress_pct = ?, current_case = ?, updated_at = ? WHERE id = ?`,
    ).run(
      p.pct == null ? null : Number(p.pct),
      (p.current_case as string) || null,
      now,
      ev.run_id,
    );
  }
  if (ev.type === "suite.finished" || ev.type === "suite.held" || ev.type === "suite.cancelled") {
    const status =
      ev.type === "suite.held"
        ? "held"
        : ev.type === "suite.cancelled"
          ? "cancelled"
          : String(p.status || "passed");
    db.prepare(
      `UPDATE suite_runs SET status = ?, finished_at = ?, verdict_raw = ?,
        totals_passed = COALESCE(?, totals_passed),
        totals_failed = COALESCE(?, totals_failed),
        totals_skipped = COALESCE(?, totals_skipped),
        status_reason = COALESCE(?, status_reason),
        updated_at = ? WHERE id = ?`,
    ).run(
      status,
      ev.ts,
      (p.verdict_raw as string) || null,
      p.totals_passed ?? null,
      p.totals_failed ?? null,
      p.totals_skipped ?? null,
      (p.reason as string) || null,
      now,
      ev.run_id,
    );
  }
  if (ev.type === "defect.filed") {
    const title = String(p.title || "defect");
    const area = (p.area as string) || "other";
    const caseKey = (p.case_key as string) || null;
    const fp = defectFingerprint(title, caseKey, area);
    const id = String(p.defect_id || `${ev.run_id}:${fp.slice(0, 8)}`);
    db.prepare(
      `INSERT OR REPLACE INTO defects (
        id, suite_run_id, case_key, title, expected, actual, severity, grade, area,
        market, device, evidence_urls, found_at, fingerprint, regression_count,
        first_seen_run_id, last_seen_run_id, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    ).run(
      id,
      ev.run_id,
      caseKey,
      title,
      (p.expected as string) || null,
      (p.actual as string) || null,
      (p.severity as string) || "P2",
      (p.grade as string) || "DEFECT",
      area,
      JSON.stringify(p.market || []),
      JSON.stringify(p.device || []),
      JSON.stringify(p.evidence_urls || []),
      ev.ts,
      fp,
      ev.run_id,
      ev.run_id,
      "open",
    );
  }
}

async function projectPg(ev: IngestEvent, sql: Pg = getPg()): Promise<void> {
  const p = ev.payload || {};
  const now = new Date().toISOString();
  if (ev.type === "suite.queued" || ev.type === "suite.started") {
    const status = ev.type === "suite.queued" ? "queued" : "running";
    await sql`
      INSERT INTO suite_runs (
        id, suite_key, suite_name, kind, trigger, started_by_kind, started_by_name,
        queued_at, started_at, status, env, git_sha, branch, source, created_at, updated_at,
        totals_passed, totals_failed, totals_skipped
      ) VALUES (
        ${ev.run_id},
        ${String(p.suite_key || "unknown")},
        ${String(p.suite_name || p.suite_key || "unknown")},
        ${String(p.kind || "manual")},
        ${String(p.trigger || "bot")},
        ${(p.started_by_kind as string) || "bot"},
        ${(p.started_by_name as string) || null},
        ${ev.type === "suite.queued" ? ev.ts : null},
        ${ev.type === "suite.started" ? ev.ts : null},
        ${status},
        ${(p.env as string) || null},
        ${(p.git_sha as string) || null},
        ${(p.branch as string) || null},
        ${String(p.source || "bot")},
        ${now}, ${now}, 0, 0, 0
      )
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        started_at = COALESCE(EXCLUDED.started_at, suite_runs.started_at),
        queued_at = COALESCE(EXCLUDED.queued_at, suite_runs.queued_at),
        env = COALESCE(EXCLUDED.env, suite_runs.env),
        git_sha = COALESCE(EXCLUDED.git_sha, suite_runs.git_sha),
        branch = COALESCE(EXCLUDED.branch, suite_runs.branch),
        updated_at = EXCLUDED.updated_at
    `;
    if (ev.type === "suite.queued" && p.queue) {
      await sql`
        INSERT INTO queue_items (
          id, suite_key, suite_name, position, requested_by_id, requested_by_kind, requested_by_name,
          requested_at, scheduled_for, priority, status, wrike_task_id, trigger_comment_id
        ) VALUES (
          ${String(p.queue_id || ev.run_id)},
          ${String(p.suite_key || "unknown")},
          ${String(p.suite_name || "unknown")},
          ${Number(p.position || 0)},
          ${(p.requested_by_id as string) || null},
          ${(p.requested_by_kind as string) || null},
          ${(p.requested_by_name as string) || null},
          ${ev.ts},
          ${(p.scheduled_for as string) || null},
          ${Number(p.priority || 0)},
          ${"waiting"},
          ${(p.wrike_task_id as string) || null},
          ${(p.trigger_comment_id as string) || null}
        )
        ON CONFLICT (id) DO UPDATE SET position = EXCLUDED.position, status = EXCLUDED.status
      `;
    }
  }
  if (ev.type === "suite.progress") {
    await sql`
      UPDATE suite_runs SET
        progress_pct = ${p.pct == null ? null : Number(p.pct)},
        current_case = ${(p.current_case as string) || null},
        updated_at = ${now}
      WHERE id = ${ev.run_id}
    `;
  }
  if (ev.type === "suite.finished" || ev.type === "suite.held" || ev.type === "suite.cancelled") {
    const status =
      ev.type === "suite.held"
        ? "held"
        : ev.type === "suite.cancelled"
          ? "cancelled"
          : String(p.status || "passed");
    await sql`
      UPDATE suite_runs SET
        status = ${status},
        finished_at = ${ev.ts},
        verdict_raw = ${(p.verdict_raw as string) || null},
        totals_passed = COALESCE(${(p.totals_passed as number) ?? null}, totals_passed),
        totals_failed = COALESCE(${(p.totals_failed as number) ?? null}, totals_failed),
        totals_skipped = COALESCE(${(p.totals_skipped as number) ?? null}, totals_skipped),
        status_reason = COALESCE(${(p.reason as string) || null}, status_reason),
        updated_at = ${now}
      WHERE id = ${ev.run_id}
    `;
  }
  if (ev.type === "defect.filed") {
    const title = String(p.title || "defect");
    const area = (p.area as string) || "other";
    const caseKey = (p.case_key as string) || null;
    const fp = defectFingerprint(title, caseKey, area);
    const id = String(p.defect_id || `${ev.run_id}:${fp.slice(0, 8)}`);
    await sql`
      INSERT INTO defects (
        id, suite_run_id, case_key, title, expected, actual, severity, grade, area,
        market, device, evidence_urls, found_at, fingerprint, regression_count,
        first_seen_run_id, last_seen_run_id, status
      ) VALUES (
        ${id}, ${ev.run_id}, ${caseKey}, ${title},
        ${(p.expected as string) || null}, ${(p.actual as string) || null},
        ${(p.severity as string) || "P2"}, ${(p.grade as string) || "DEFECT"}, ${area},
        ${sql.json((p.market || []) as Parameters<typeof sql.json>[0])},
        ${sql.json((p.device || []) as Parameters<typeof sql.json>[0])},
        ${sql.json((p.evidence_urls || []) as Parameters<typeof sql.json>[0])},
        ${ev.ts}, ${fp}, 1, ${ev.run_id}, ${ev.run_id}, ${"open"}
      )
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, last_seen_run_id = EXCLUDED.last_seen_run_id
    `;
  }
}

function upsertRunSqlite(
  db: ReturnType<typeof getDb>,
  row: {
    id: string;
    status: string;
    queued_at?: string;
    started_at?: string;
    suite_key: string;
    suite_name: string;
    kind: string;
    trigger: string;
    source: string;
    started_by_name: string | null;
    started_by_kind: string | null;
    env?: string | null;
    git_sha?: string | null;
    branch?: string | null;
    now: string;
  },
): void {
  const existing = db.prepare("SELECT id FROM suite_runs WHERE id = ?").get(row.id);
  if (!existing) {
    db.prepare(
      `INSERT INTO suite_runs (
        id, suite_key, suite_name, kind, trigger, started_by_kind, started_by_name,
        queued_at, started_at, status, env, git_sha, branch, source, created_at, updated_at,
        totals_passed, totals_failed, totals_skipped
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)`,
    ).run(
      row.id,
      row.suite_key,
      row.suite_name,
      row.kind,
      row.trigger,
      row.started_by_kind,
      row.started_by_name,
      row.queued_at || null,
      row.started_at || null,
      row.status,
      row.env || null,
      row.git_sha || null,
      row.branch || null,
      row.source,
      row.now,
      row.now,
    );
  } else {
    db.prepare(
      `UPDATE suite_runs SET status = ?, started_at = COALESCE(?, started_at),
        queued_at = COALESCE(?, queued_at), env = COALESCE(?, env),
        git_sha = COALESCE(?, git_sha), branch = COALESCE(?, branch), updated_at = ?
       WHERE id = ?`,
    ).run(
      row.status,
      row.started_at || null,
      row.queued_at || null,
      row.env || null,
      row.git_sha || null,
      row.branch || null,
      row.now,
      row.id,
    );
  }
}
