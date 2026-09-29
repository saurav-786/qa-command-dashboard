# Real-time data (not DEMO)

The yellow **DEMO DATA** banner means `DEMO_MODE=1`. That uses an isolated seed DB and simulated progress. It will never show Claude Code / Grokbot / Codex / Cursor runs.

Real-time path:

1. Dashboard runs with **`DEMO_MODE` unset / `0`**
2. Bot / agents POST signed events to `/api/ingest`
3. UI updates over SSE (`/api/stream`)

## One-time setup on the Mac

```bash
cd ~/qa-automation-bot/qa-dashboard

# 1) Ingest secret (never commit this)
SECRET="$(openssl rand -hex 32)"
security add-generic-password -U -s qa-automation-bot-dashboard-ingest -a "$USER" -w "$SECRET"
# also put it in .env.local for Next:
cat > .env.local <<EOF
DEMO_MODE=0
INGEST_SECRET=$SECRET
SQLITE_PATH=$HOME/qa-automation-bot/qa-dashboard/data/qa-command.sqlite
EOF
unset SECRET

# 2) Install producer next to the bot (if missing)
mkdir -p ~/qa-automation-bot/scripts
cp -f producer/emit_event.py ~/qa-automation-bot/scripts/emit_event.py
cp -f producer/dashboard-emit.sh ~/qa-automation-bot/scripts/dashboard-emit.sh
chmod +x ~/qa-automation-bot/scripts/dashboard-emit.sh ~/qa-automation-bot/scripts/emit_event.py

# 3) Hook the watcher (safe: writes new file then mv)
bash producer/install-watcher-hooks.sh

# 4) Start dashboard in REAL mode (no DEMO_MODE=1)
npm ci
npm run db:migrate
npm run dev:real
```

Open http://127.0.0.1:3000 — the DEMO banner must be **gone**.

## Backfill existing bot history

With the dashboard running:

```bash
cd ~/qa-automation-bot
export INGEST_URL=http://127.0.0.1:3000/api/ingest
export BOT_PATH="$HOME/qa-automation-bot"
# secret from Keychain is used automatically by emit_event.py
python3 scripts/emit_event.py backfill
python3 scripts/emit_event.py replay   # if anything landed in logs/events-outbox.jsonl
```

History should fill from `runs/*/spec.json` and `runs/*/round*/spec.json`.

## What every agent must do (Claude / Grokbot / Codex / Cursor)

At suite start / finish, fire-and-forget (3s timeout, never block the run):

```bash
# start
~/qa-automation-bot/scripts/dashboard-emit.sh started \
  --run-id "bot:<permalinkId>:<roundN>" \
  --suite-key "<component>" \
  --suite-name "<title>" \
  --starter-kind "codex" \   # or claude | grokbot | cursor | hermes | ci | schedule
  --starter-name "Codex"

# finish
~/qa-automation-bot/scripts/dashboard-emit.sh finished \
  --run-id "bot:<permalinkId>:<roundN>" \
  --status passed|failed|held|cancelled \
  --verdict "NOT READY – …" \
  --passed N --failed N --skipped N
```

`AGENTS.md` in the bot folder should include this. The watcher hooks cover launchd runs automatically after `install-watcher-hooks.sh` + watcher restart (only when `logs/qa-run.lock` is absent):

```bash
launchctl kickstart -k gui/$(id -u)/de.sportstech.qa-watcher
```

## Quick checks

| Symptom | Cause |
|---|---|
| Yellow DEMO banner | Still starting with `DEMO_MODE=1` / `npm run dev:demo` |
| Empty history after backfill | Dashboard not reachable, wrong `INGEST_SECRET`, or no `runs/**/spec.json` |
| Outbox growing | `logs/events-outbox.jsonl` — run `emit_event.py replay` |
| Still "Demo Bot" | Old demo DB file; delete `data/qa-command.sqlite*` then `npm run db:migrate` and backfill |

## Do not

- Do not keep `DEMO_MODE=1` if you want production/live ops.
- Do not paste Keychain secrets into chat or commit `.env.local`.
- Do not call Wrike/Shopify from the dashboard — only ingest events from the bot/agents.
