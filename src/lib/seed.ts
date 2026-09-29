import { getDb, isDemoMode } from "./db";
import { defectFingerprint } from "./fingerprint";

function nowOffset(mins: number): string {
  return new Date(Date.now() + mins * 60_000).toISOString();
}

function past(minsAgo: number): string {
  return new Date(Date.now() - minsAgo * 60_000).toISOString();
}

/** Seed DEMO fixtures. Idempotent: clears demo-sourced rows then reinserts. */
export function seedDemo(): { runs: number; defects: number; queue: number } {
  if (!isDemoMode()) {
    throw new Error("seedDemo requires DEMO_MODE=1");
  }
  const db = getDb();
  db.exec(`
    DELETE FROM regression_occurrences;
    DELETE FROM regressions;
    DELETE FROM wrike_links;
    DELETE FROM defects;
    DELETE FROM queue_items;
    DELETE FROM run_events;
    DELETE FROM suite_runs WHERE source = 'demo';
  `);

  const insertRun = db.prepare(`INSERT INTO suite_runs (
    id, suite_key, suite_name, kind, trigger, started_by_id, started_by_kind, started_by_name,
    queued_at, started_at, finished_at, status, status_reason, verdict_raw, env, git_sha, branch, pr_url,
    wrike_task_id, wrike_task_url, totals_passed, totals_failed, totals_skipped, totals_flaky, totals_warn, totals_open,
    current_case, progress_pct, log_ref, report_ref, source, created_at, updated_at
  ) VALUES (
    @id, @suite_key, @suite_name, @kind, @trigger, @started_by_id, @started_by_kind, @started_by_name,
    @queued_at, @started_at, @finished_at, @status, @status_reason, @verdict_raw, @env, @git_sha, @branch, @pr_url,
    @wrike_task_id, @wrike_task_url, @totals_passed, @totals_failed, @totals_skipped, @totals_flaky, @totals_warn, @totals_open,
    @current_case, @progress_pct, @log_ref, @report_ref, @source, @created_at, @updated_at
  )`);

  const base = {
    kind: "stl-journey",
    trigger: "bot",
    started_by_id: "demo-bot",
    started_by_kind: "hermes",
    started_by_name: "Demo Bot",
    status_reason: null as string | null,
    verdict_raw: null as string | null,
    env: "preview:205",
    git_sha: "a1b2c3d",
    branch: "main",
    pr_url: null as string | null,
    wrike_task_id: null as string | null,
    wrike_task_url: null as string | null,
    totals_flaky: 0,
    totals_warn: 0,
    totals_open: 0,
    current_case: null as string | null,
    progress_pct: null as number | null,
    log_ref: null as string | null,
    report_ref: null as string | null,
    source: "demo",
    created_at: past(120),
    updated_at: past(1),
  };

  // Running with progress
  insertRun.run({
    ...base,
    id: "demo:run:live",
    suite_key: "agent-qa-pdp-cart",
    suite_name: "agent-qa / sportstech.de PDP+Cart",
    queued_at: past(20),
    started_at: past(14),
    finished_at: null,
    status: "running",
    totals_passed: 41,
    totals_failed: 3,
    totals_skipped: 2,
    current_case: "PDP ATC enabled — sGym Pro",
    progress_pct: 62,
    updated_at: past(0),
  });

  // Passed
  insertRun.run({
    ...base,
    id: "demo:run:passed",
    suite_key: "workout-pause-sync",
    suite_name: "Workout pause sync",
    started_by_kind: "user",
    started_by_name: "Demo User A",
    queued_at: past(200),
    started_at: past(195),
    finished_at: past(186),
    status: "passed",
    verdict_raw: "LIVE OK",
    env: "live",
    totals_passed: 28,
    totals_failed: 0,
    totals_skipped: 1,
  });

  // Failed with two Wrike tickets + regression fingerprint
  const failedId = "demo:run:failed-wrike";
  insertRun.run({
    ...base,
    id: failedId,
    suite_key: "sgym-rom-graph",
    suite_name: "sGym ROM graph",
    queued_at: past(400),
    started_at: past(390),
    finished_at: past(378),
    status: "failed",
    verdict_raw: "NOT READY – 1 AC failed, 2 defects",
    wrike_task_id: "1842",
    wrike_task_url: "https://www.wrike.com/open.htm?id=1842",
    totals_passed: 12,
    totals_failed: 2,
    totals_skipped: 0,
  });

  // Failed unfiled
  insertRun.run({
    ...base,
    id: "demo:run:failed-unfiled",
    suite_key: "cmp-mobile",
    suite_name: "CMP mobile 390",
    started_by_kind: "ci",
    started_by_name: "Demo CI",
    queued_at: past(500),
    started_at: past(490),
    finished_at: past(480),
    status: "failed",
    verdict_raw: "NO-GO – layout defect",
    totals_passed: 5,
    totals_failed: 1,
    totals_skipped: 0,
  });

  // Flaky / cancelled / held
  insertRun.run({
    ...base,
    id: "demo:run:flaky",
    suite_key: "daily-smoke",
    suite_name: "Daily smoke",
    trigger: "schedule",
    started_by_kind: "schedule",
    started_by_name: "Demo Schedule",
    kind: "daily-smoke",
    queued_at: past(800),
    started_at: past(790),
    finished_at: past(770),
    status: "flaky",
    verdict_raw: "CONDITIONAL",
    env: "live",
    totals_passed: 40,
    totals_failed: 1,
    totals_skipped: 0,
    totals_flaky: 1,
  });
  insertRun.run({
    ...base,
    id: "demo:run:cancelled",
    suite_key: "mention-validate",
    suite_name: "Mention validate",
    kind: "mention",
    started_by_kind: "user",
    started_by_name: "Demo User B",
    queued_at: past(900),
    started_at: past(890),
    finished_at: past(889),
    status: "cancelled",
    status_reason: "skipped — duplicate request",
    totals_passed: 0,
    totals_failed: 0,
    totals_skipped: 0,
  });
  insertRun.run({
    ...base,
    id: "demo:run:held",
    suite_key: "preview-sticky-atc",
    suite_name: "Sticky ATC preview",
    kind: "preview-validation",
    started_by_kind: "bot",
    started_by_name: "Demo Bot",
    queued_at: past(1000),
    started_at: past(990),
    finished_at: past(970),
    status: "held",
    status_reason: "drafted — Cloudflare 429 during run",
    verdict_raw: "NOT READY (held)",
    totals_passed: 8,
    totals_failed: 1,
    totals_skipped: 0,
  });

  // Prior runs for same fingerprint (regression_count 3)
  for (const [i, id] of [
    ["demo:run:reg-1", 2000],
    ["demo:run:reg-2", 1500],
  ] as const) {
    insertRun.run({
      ...base,
      id: i,
      suite_key: "sgym-rom-graph",
      suite_name: "sGym ROM graph",
      queued_at: past(Number(id) + 20),
      started_at: past(Number(id)),
      finished_at: past(Number(id) - 15),
      status: "failed",
      verdict_raw: "NOT READY",
      totals_passed: 10,
      totals_failed: 1,
      totals_skipped: 0,
    });
  }

  // Fixed + live defect run
  const fixedRun = "demo:run:fixed-live";
  insertRun.run({
    ...base,
    id: fixedRun,
    suite_key: "bluetooth-treadmill",
    suite_name: "Bluetooth treadmill",
    started_by_kind: "ci",
    started_by_name: "Demo CI",
    queued_at: past(3000),
    started_at: past(2990),
    finished_at: past(2970),
    status: "failed",
    verdict_raw: "LIVE ISSUE",
    env: "live",
    wrike_task_id: "1901",
    wrike_task_url: "https://www.wrike.com/open.htm?id=1901",
    totals_passed: 20,
    totals_failed: 1,
    totals_skipped: 0,
  });

  const fp = defectFingerprint(
    "ROM graph stalls after pause on sGym",
    "verify_rom_graph",
    "console",
  );

  const insertDefect = db.prepare(`INSERT INTO defects (
    id, suite_run_id, case_key, title, expected, actual, severity, grade, area,
    market, device, evidence_urls, found_at, fixed_by_id, fixed_by_kind, fixed_by_name,
    fixed_at, went_live_at, release_id, fingerprint, regression_count, first_seen_run_id, last_seen_run_id, status
  ) VALUES (
    @id, @suite_run_id, @case_key, @title, @expected, @actual, @severity, @grade, @area,
    @market, @device, @evidence_urls, @found_at, @fixed_by_id, @fixed_by_kind, @fixed_by_name,
    @fixed_at, @went_live_at, @release_id, @fingerprint, @regression_count, @first_seen_run_id, @last_seen_run_id, @status
  )`);

  for (const [runId, mins] of [
    ["demo:run:reg-1", 2000],
    ["demo:run:reg-2", 1500],
    [failedId, 378],
  ] as const) {
    insertDefect.run({
      id: `demo:def:${runId}`,
      suite_run_id: runId,
      case_key: "verify_rom_graph",
      title: "ROM graph stalls after pause on sGym",
      expected: "session keep-alive keeps telemetry alive",
      actual: "graph freezes; HR strap drop",
      severity: "P1",
      grade: "DEFECT",
      area: "console",
      market: JSON.stringify(["de"]),
      device: JSON.stringify(["MOB-Safari"]),
      evidence_urls: JSON.stringify(["https://example.com/trace"]),
      found_at: past(mins),
      fixed_by_id: null,
      fixed_by_kind: null,
      fixed_by_name: null,
      fixed_at: null,
      went_live_at: null,
      release_id: null,
      fingerprint: fp,
      regression_count: 3,
      first_seen_run_id: "demo:run:reg-1",
      last_seen_run_id: failedId,
      status: "open",
    });
  }

  insertDefect.run({
    id: "demo:def:fixed",
    suite_run_id: fixedRun,
    case_key: "verify_session_heartbeat",
    title: "Bluetooth disconnect on treadmill after pause > 30s",
    expected: "session keep-alive",
    actual: "HR strap drop + telemetry stall",
    severity: "P1",
    grade: "FAIL",
    area: "bluetooth",
    market: JSON.stringify(["de", "de-at"]),
    device: JSON.stringify(["MOB-Safari", "DSK-Chrome"]),
    evidence_urls: JSON.stringify([
      "https://example.com/shot.png",
      "https://example.com/trace.zip",
    ]),
    found_at: past(2970),
    fixed_by_id: "demo-fixer",
    fixed_by_kind: "user",
    fixed_by_name: "Demo User A",
    fixed_at: past(2800),
    went_live_at: past(2700),
    release_id: "Release 2026.09.24-a",
    fingerprint: defectFingerprint(
      "Bluetooth disconnect on treadmill after pause",
      "verify_session_heartbeat",
      "bluetooth",
    ),
    regression_count: 1,
    first_seen_run_id: fixedRun,
    last_seen_run_id: fixedRun,
    status: "live",
  });

  insertDefect.run({
    id: "demo:def:held",
    suite_run_id: "demo:run:held",
    case_key: "sticky_atc",
    title: "Preview sticky ATC not served after Cloudflare challenge",
    expected: "preview theme loads for sticky ATC checks",
    actual: "HTTP 429 / challenge page — run held as drafted",
    severity: "P2",
    grade: "WARN",
    area: "other",
    market: JSON.stringify(["de"]),
    device: JSON.stringify(["MOB-Safari"]),
    evidence_urls: JSON.stringify(["https://example.com/held-log.txt"]),
    found_at: past(970),
    fixed_by_id: null,
    fixed_by_kind: null,
    fixed_by_name: null,
    fixed_at: null,
    went_live_at: null,
    release_id: null,
    fingerprint: defectFingerprint(
      "Preview sticky ATC not served after Cloudflare",
      "sticky_atc",
      "other",
    ),
    regression_count: 1,
    first_seen_run_id: "demo:run:held",
    last_seen_run_id: "demo:run:held",
    status: "open",
  });

  insertDefect.run({
    id: "demo:def:unfiled",
    suite_run_id: "demo:run:failed-unfiled",
    case_key: "cmp_banner",
    title: "Cookie banner covers ATC on 390px",
    expected: "banner dismissible before ATC",
    actual: "tap intercepted",
    severity: "P2",
    grade: "DEFECT",
    area: "cmp",
    market: JSON.stringify(["de"]),
    device: JSON.stringify(["MOB-Chrome"]),
    evidence_urls: JSON.stringify(["https://example.com/cmp.png"]),
    found_at: past(480),
    fixed_by_id: null,
    fixed_by_kind: null,
    fixed_by_name: null,
    fixed_at: null,
    went_live_at: null,
    release_id: null,
    fingerprint: defectFingerprint("Cookie banner covers ATC", "cmp_banner", "cmp"),
    regression_count: 1,
    first_seen_run_id: "demo:run:failed-unfiled",
    last_seen_run_id: "demo:run:failed-unfiled",
    status: "open",
  });

  db.prepare(
    `INSERT INTO regressions (fingerprint, occurrence_count, first_seen_at, last_seen_at)
     VALUES (?, 3, ?, ?)`,
  ).run(fp, past(2000), past(378));

  for (const [runId, mins] of [
    ["demo:run:reg-1", 2000],
    ["demo:run:reg-2", 1500],
    [failedId, 378],
  ] as const) {
    db.prepare(
      `INSERT INTO regression_occurrences (fingerprint, suite_run_id, defect_id, seen_at)
       VALUES (?, ?, ?, ?)`,
    ).run(fp, runId, `demo:def:${runId}`, past(mins));
  }

  const insertWrike = db.prepare(`INSERT INTO wrike_links (
    id, subject_type, subject_id, wrike_id, wrike_permalink, wrike_title, wrike_status,
    raw_status_id, assignee_ids, assignee_names, created_at, resolved_at, synced_at, unfiled_reason
  ) VALUES (
    @id, @subject_type, @subject_id, @wrike_id, @wrike_permalink, @wrike_title, @wrike_status,
    @raw_status_id, @assignee_ids, @assignee_names, @created_at, @resolved_at, @synced_at, @unfiled_reason
  )`);

  insertWrike.run({
    id: "demo:wrike:1",
    subject_type: "defect",
    subject_id: `demo:def:${failedId}`,
    wrike_id: "1842",
    wrike_permalink: "https://www.wrike.com/open.htm?id=1842",
    wrike_title: "WRK-1842 ROM graph stall",
    wrike_status: "in_progress",
    raw_status_id: null,
    assignee_ids: JSON.stringify(["demo"]),
    assignee_names: JSON.stringify(["Demo User A"]),
    created_at: past(378),
    resolved_at: null,
    synced_at: past(1),
    unfiled_reason: null,
  });
  insertWrike.run({
    id: "demo:wrike:2",
    subject_type: "run",
    subject_id: failedId,
    wrike_id: "1843",
    wrike_permalink: "https://www.wrike.com/open.htm?id=1843",
    wrike_title: "WRK-1843 parent task",
    wrike_status: "open",
    raw_status_id: null,
    assignee_ids: JSON.stringify([]),
    assignee_names: JSON.stringify([]),
    created_at: past(400),
    resolved_at: null,
    synced_at: past(1),
    unfiled_reason: null,
  });
  insertWrike.run({
    id: "demo:wrike:fixed",
    subject_type: "defect",
    subject_id: "demo:def:fixed",
    wrike_id: "1901",
    wrike_permalink: "https://www.wrike.com/open.htm?id=1901",
    wrike_title: "WRK-1901 Bluetooth disconnect",
    wrike_status: "done",
    raw_status_id: null,
    assignee_ids: JSON.stringify(["demo-fixer"]),
    assignee_names: JSON.stringify(["Demo User A"]),
    created_at: past(2970),
    resolved_at: past(2800),
    synced_at: past(1),
    unfiled_reason: null,
  });
  insertWrike.run({
    id: "demo:wrike:unfiled",
    subject_type: "defect",
    subject_id: "demo:def:unfiled",
    wrike_id: "",
    wrike_permalink: null,
    wrike_title: null,
    wrike_status: "unknown",
    raw_status_id: null,
    assignee_ids: JSON.stringify([]),
    assignee_names: JSON.stringify([]),
    created_at: past(480),
    resolved_at: null,
    synced_at: past(1),
    unfiled_reason: "not yet triaged",
  });

  const q = db.prepare(`INSERT INTO queue_items (
    id, suite_key, suite_name, position, requested_by_id, requested_by_kind, requested_by_name,
    requested_at, scheduled_for, priority, status, wrike_task_id, trigger_comment_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  q.run(
    "demo:q:1",
    "playwright-contracts-de",
    "Playwright contracts DE",
    1,
    "u1",
    "user",
    "Demo User A",
    past(5),
    nowOffset(15),
    10,
    "waiting",
    null,
    null,
  );
  q.run(
    "demo:q:2",
    "winback-offer",
    "Winback offer eligibility",
    2,
    "ci",
    "ci",
    "Demo CI",
    past(4),
    nowOffset(30),
    5,
    "waiting",
    null,
    null,
  );
  q.run(
    "demo:q:3",
    "cmp-mobile",
    "CMP mobile 390",
    3,
    "u2",
    "manual",
    "Demo User B",
    past(3),
    null,
    0,
    "waiting",
    null,
    null,
  );

  // event seq for SSE
  db.prepare(
    `INSERT INTO run_events (event_id, run_id, type, ts, seq, payload, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "demo:evt:1",
    "demo:run:live",
    "suite.progress",
    past(0),
    1,
    JSON.stringify({ pct: 62, current_case: "PDP ATC enabled — sGym Pro" }),
    past(0),
  );

  db.prepare(
    `INSERT INTO meta (key, value) VALUES ('demo_seeded_at', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(new Date().toISOString());

  const runs = (
    db.prepare("SELECT COUNT(*) AS c FROM suite_runs WHERE source='demo'").get() as { c: number }
  ).c;
  const defects = (db.prepare("SELECT COUNT(*) AS c FROM defects").get() as { c: number }).c;
  const queue = (db.prepare("SELECT COUNT(*) AS c FROM queue_items").get() as { c: number }).c;
  return { runs, defects, queue };
}

export function ensureDemoSeeded(): void {
  if (!isDemoMode()) return;
  const db = getDb();
  const row = db.prepare("SELECT value FROM meta WHERE key='demo_seeded_at'").get() as
    | { value: string }
    | undefined;
  if (!row) seedDemo();
}
