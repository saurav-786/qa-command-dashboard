-- Postgres schema for Vercel / Neon

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suite_runs (
  id TEXT PRIMARY KEY,
  suite_key TEXT NOT NULL,
  suite_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  trigger TEXT NOT NULL,
  started_by_id TEXT,
  started_by_kind TEXT,
  started_by_name TEXT,
  queued_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  status_reason TEXT,
  verdict_raw TEXT,
  env TEXT,
  git_sha TEXT,
  branch TEXT,
  pr_url TEXT,
  wrike_task_id TEXT,
  wrike_task_url TEXT,
  totals_passed INTEGER DEFAULT 0,
  totals_failed INTEGER DEFAULT 0,
  totals_skipped INTEGER DEFAULT 0,
  totals_flaky INTEGER DEFAULT 0,
  totals_warn INTEGER DEFAULT 0,
  totals_open INTEGER DEFAULT 0,
  current_case TEXT,
  progress_pct DOUBLE PRECISION,
  log_ref TEXT,
  report_ref TEXT,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suite_runs_started ON suite_runs(started_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_suite_runs_status ON suite_runs(status);
CREATE INDEX IF NOT EXISTS idx_suite_runs_suite ON suite_runs(suite_key);

CREATE TABLE IF NOT EXISTS run_events (
  event_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  type TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  seq BIGINT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_run_events_seq ON run_events(seq);
CREATE INDEX IF NOT EXISTS idx_run_events_run ON run_events(run_id, seq);

CREATE TABLE IF NOT EXISTS queue_items (
  id TEXT PRIMARY KEY,
  suite_key TEXT NOT NULL,
  suite_name TEXT NOT NULL,
  position INTEGER NOT NULL,
  requested_by_id TEXT,
  requested_by_kind TEXT,
  requested_by_name TEXT,
  requested_at TIMESTAMPTZ NOT NULL,
  scheduled_for TIMESTAMPTZ,
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  wrike_task_id TEXT,
  trigger_comment_id TEXT
);

CREATE TABLE IF NOT EXISTS defects (
  id TEXT PRIMARY KEY,
  suite_run_id TEXT NOT NULL,
  case_key TEXT,
  title TEXT NOT NULL,
  expected TEXT,
  actual TEXT,
  severity TEXT,
  grade TEXT NOT NULL,
  area TEXT,
  market JSONB DEFAULT '[]'::jsonb,
  device JSONB DEFAULT '[]'::jsonb,
  evidence_urls JSONB DEFAULT '[]'::jsonb,
  found_at TIMESTAMPTZ,
  fixed_by_id TEXT,
  fixed_by_kind TEXT,
  fixed_by_name TEXT,
  fixed_at TIMESTAMPTZ,
  went_live_at TIMESTAMPTZ,
  release_id TEXT,
  fingerprint TEXT,
  regression_count INTEGER DEFAULT 1,
  first_seen_run_id TEXT,
  last_seen_run_id TEXT,
  status TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_defects_run ON defects(suite_run_id);
CREATE INDEX IF NOT EXISTS idx_defects_fp ON defects(fingerprint);

CREATE TABLE IF NOT EXISTS wrike_links (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  wrike_id TEXT NOT NULL,
  wrike_permalink TEXT,
  wrike_title TEXT,
  wrike_status TEXT,
  raw_status_id TEXT,
  assignee_ids JSONB DEFAULT '[]'::jsonb,
  assignee_names JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ,
  unfiled_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_wrike_subject ON wrike_links(subject_type, subject_id);

CREATE TABLE IF NOT EXISTS regressions (
  fingerprint TEXT PRIMARY KEY,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS regression_occurrences (
  fingerprint TEXT NOT NULL,
  suite_run_id TEXT NOT NULL,
  defect_id TEXT NOT NULL,
  seen_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (fingerprint, suite_run_id, defect_id)
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
