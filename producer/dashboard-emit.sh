#!/bin/zsh
# Fire-and-forget dashboard emit for Claude / Grokbot / Codex / Cursor / watcher.
# Never prints secrets. Always exits 0 so it cannot fail a QA run.
set -eu
BOT_PATH="${BOT_PATH:-$HOME/qa-automation-bot}"
EMIT="$BOT_PATH/scripts/emit_event.py"
if [ ! -f "$EMIT" ]; then
  EMIT="$(cd "$(dirname "$0")" && pwd)/emit_event.py"
fi
export BOT_PATH
export INGEST_URL="${INGEST_URL:-http://127.0.0.1:3000/api/ingest}"

cmd="${1:-}"
shift || true

run_id=""
suite_key="unknown"
suite_name="unknown"
starter_kind="bot"
starter_name="QA Automation Bot"
status="passed"
verdict=""
passed=0
failed=0
skipped=0
env_name="live"
branch=""
sha=""
current_case=""
pct=""

while [ $# -gt 0 ]; do
  case "$1" in
    --run-id) run_id="$2"; shift 2 ;;
    --suite-key) suite_key="$2"; shift 2 ;;
    --suite-name) suite_name="$2"; shift 2 ;;
    --starter-kind) starter_kind="$2"; shift 2 ;;
    --starter-name) starter_name="$2"; shift 2 ;;
    --status) status="$2"; shift 2 ;;
    --verdict) verdict="$2"; shift 2 ;;
    --passed) passed="$2"; shift 2 ;;
    --failed) failed="$2"; shift 2 ;;
    --skipped) skipped="$2"; shift 2 ;;
    --env) env_name="$2"; shift 2 ;;
    --branch) branch="$2"; shift 2 ;;
    --sha) sha="$2"; shift 2 ;;
    --current-case) current_case="$2"; shift 2 ;;
    --pct) pct="$2"; shift 2 ;;
    *) shift ;;
  esac
done

[ -n "$run_id" ] || { echo "dashboard-emit: --run-id required" >&2; exit 0; }
[ -f "$EMIT" ] || { echo "dashboard-emit: emit_event.py missing" >&2; exit 0; }

case "$cmd" in
  queued)
    payload=$(printf '{"suite_key":"%s","suite_name":"%s","kind":"mention","trigger":"bot","source":"bot","started_by_kind":"%s","started_by_name":"%s","queue":true,"position":0}' \
      "$suite_key" "$suite_name" "$starter_kind" "$starter_name")
    type="suite.queued"
    ;;
  started)
    payload=$(printf '{"suite_key":"%s","suite_name":"%s","kind":"mention","trigger":"bot","source":"bot","started_by_kind":"%s","started_by_name":"%s","env":"%s","branch":"%s","git_sha":"%s"}' \
      "$suite_key" "$suite_name" "$starter_kind" "$starter_name" "$env_name" "$branch" "$sha")
    type="suite.started"
    ;;
  progress)
    payload=$(printf '{"pct":%s,"current_case":"%s"}' "${pct:-null}" "$current_case")
    type="suite.progress"
    ;;
  finished)
    payload=$(printf '{"status":"%s","verdict_raw":"%s","totals_passed":%s,"totals_failed":%s,"totals_skipped":%s,"source":"bot"}' \
      "$status" "$verdict" "$passed" "$failed" "$skipped")
    type="suite.finished"
    ;;
  held)
    payload=$(printf '{"reason":"%s","verdict_raw":"%s"}' "$verdict" "$verdict")
    type="suite.held"
    ;;
  *)
    echo "dashboard-emit: unknown cmd $cmd" >&2
    exit 0
    ;;
esac

# 3s timeout, never fail the caller
( python3 "$EMIT" "$type" --run-id "$run_id" --json "$payload" >/dev/null 2>&1 ) &
EXIT=0
wait $! || EXIT=$?
exit 0
