#!/bin/bash
# Install fire-and-forget dashboard emit hooks into qa-watcher.sh (atomic mv).
set -euo pipefail
BOT="${BOT_PATH:-$HOME/qa-automation-bot}"
WATCHER="$BOT/scripts/qa-watcher.sh"
EMIT_SH="$BOT/scripts/dashboard-emit.sh"
MARKER="# qa-command-dashboard-emit"

if [ ! -f "$WATCHER" ]; then
  echo "No $WATCHER — skip hooks (bot tree incomplete)."
  exit 0
fi
if [ ! -f "$EMIT_SH" ]; then
  echo "Copy dashboard-emit.sh + emit_event.py into $BOT/scripts/ first."
  exit 1
fi
if grep -q "$MARKER" "$WATCHER"; then
  echo "Watcher already hooked."
  exit 0
fi

TMP="$(mktemp)"
cp "$WATCHER" "$TMP"

# Append helper near top after shebang block is hard; instead append sourced function file.
HOOK="$BOT/scripts/qa-watcher-dashboard-hooks.sh"
cat > "$HOOK" <<'HOOK'
# qa-command-dashboard-emit
# Sourced or called from qa-watcher.sh — must never fail the watcher.
dashboard_emit() {
  local cmd="$1"; shift || true
  if [ -x "$HOME/qa-automation-bot/scripts/dashboard-emit.sh" ]; then
    "$HOME/qa-automation-bot/scripts/dashboard-emit.sh" "$cmd" "$@" >/dev/null 2>&1 &
  fi
  return 0
}
HOOK

# Prepend source line after the first line
{
  head -n 1 "$TMP"
  echo "source \"$HOOK\"  # qa-command-dashboard-emit"
  tail -n +2 "$TMP"
} > "${TMP}.new"
mv "${TMP}.new" "$TMP"

# Best-effort: after common log patterns, add emit calls via wrapper comments.
# Operators should also call dashboard_emit from start/done sites; we add a
# trailing note so humans know.
cat >> "$TMP" <<'EOF'

# --- qa-command-dashboard-emit (manual call sites) ---
# After you log "queued …":  dashboard_emit queued --run-id "bot:$taskId:$commentId:round0" --suite-name "$title" --starter-kind bot --starter-name "QA Automation Bot"
# After you log "start …":   dashboard_emit started --run-id "…" --suite-name "$title" --starter-kind bot --starter-name "QA Automation Bot"
# After you log "done …":    dashboard_emit finished --run-id "…" --status passed|failed|held --verdict "$verdict" --passed N --failed N
# Restart watcher only when logs/qa-run.lock is absent:
#   launchctl kickstart -k gui/$(id -u)/de.sportstech.qa-watcher
EOF

mv "$TMP" "$WATCHER"
chmod +x "$WATCHER"
echo "Updated $WATCHER (hooks helper installed)."
echo "Add the dashboard_emit call sites if your watcher does not already call them."
echo "Restart watcher when idle (no qa-run.lock)."
