export type RunStatus =
  | "queued"
  | "running"
  | "passed"
  | "failed"
  | "cancelled"
  | "flaky"
  | "held";

export type ActorKind = "user" | "bot" | "hermes" | "grokbot" | "ci" | "schedule";

export interface SuiteRun {
  id: string;
  suite_key: string;
  suite_name: string;
  kind: string;
  trigger: string;
  started_by_id: string | null;
  started_by_kind: ActorKind | string | null;
  started_by_name: string | null;
  queued_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  status: RunStatus;
  status_reason: string | null;
  verdict_raw: string | null;
  env: string | null;
  git_sha: string | null;
  branch: string | null;
  pr_url: string | null;
  wrike_task_id: string | null;
  wrike_task_url: string | null;
  totals_passed: number;
  totals_failed: number;
  totals_skipped: number;
  totals_flaky: number;
  totals_warn: number;
  totals_open: number;
  current_case: string | null;
  progress_pct: number | null;
  log_ref: string | null;
  report_ref: string | null;
  source: string;
  created_at: string;
  updated_at: string;
  /** History-table enrichments (optional) */
  defect_count?: number;
  regression_max?: number;
  went_live_at?: string | null;
  fixed_by_name?: string | null;
  unfiled_reason?: string | null;
}

export interface QueueItem {
  id: string;
  suite_key: string;
  suite_name: string;
  position: number;
  requested_by_id: string | null;
  requested_by_kind: string | null;
  requested_by_name: string | null;
  requested_at: string;
  scheduled_for: string | null;
  priority: number;
  status: string;
  wrike_task_id: string | null;
  trigger_comment_id: string | null;
}

export interface Defect {
  id: string;
  suite_run_id: string;
  case_key: string | null;
  title: string;
  expected: string | null;
  actual: string | null;
  severity: string | null;
  grade: string;
  area: string | null;
  market: string[];
  device: string[];
  evidence_urls: string[];
  found_at: string | null;
  fixed_by_id: string | null;
  fixed_by_kind: string | null;
  fixed_by_name: string | null;
  fixed_at: string | null;
  went_live_at: string | null;
  release_id: string | null;
  fingerprint: string | null;
  regression_count: number;
  first_seen_run_id: string | null;
  last_seen_run_id: string | null;
  status: string;
  wrike?: WrikeLink[];
  regression?: {
    count: number;
    last: { run_id: string; seen_at: string }[];
  };
}

export interface WrikeLink {
  id: string;
  subject_type: string;
  subject_id: string;
  wrike_id: string;
  wrike_permalink: string | null;
  wrike_title: string | null;
  wrike_status: string | null;
  raw_status_id: string | null;
  assignee_ids: string[];
  assignee_names: string[];
  created_at: string | null;
  resolved_at: string | null;
  synced_at: string | null;
  unfiled_reason: string | null;
}

export interface IngestEvent {
  event_id: string;
  type: string;
  ts: string;
  run_id: string;
  seq: number;
  payload: Record<string, unknown>;
}
