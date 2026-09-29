# QA Automation Bot capability matrix

Goal: Cursor (this agent) can do what Claude Code, Grokbot, and Codex do today for Sportstech QA — and the Command Dashboard stays the live ops surface.

| Capability | Claude / Codex / Grokbot today | This environment now | To unlock |
|---|---|---|---|
| Command Dashboard UI + DEMO_MODE | Partial (Codex WIP) | **Done** in `/agent/qa-dashboard` | Copy/push repo to Mac / GitHub |
| Signed ingest + SSE live updates | Codex WIP | **Done** (local) | Deploy + `INGEST_URL` / secret |
| Watcher hooks (`emit_event.py`) | Codex WIP | Script shipped | Hook into `qa-watcher.sh` on Mac |
| Wrike candidates / validate / post | Yes on Mac | Docs only (`docs/bot-uploads/`) | Mac + Keychain `qa-automation-bot-wrike` |
| Playwright validate / card-layout / PDF | Yes on Mac | Not present | Bot folder `lib/`, Playwright browsers |
| Shopify Admin read (`shopify.py`) | Yes on Mac | Not present | Keychain Shopify client credentials |
| GitHub Actions `grokbot` `qa-run.yml` | Yes | Repo 404 here | Access to `saurav-786/grokbot` |
| Defect tasks via `wrike.py defect` | Yes | Not present | Bot folder + approval rules |

## Recommended next step on your Mac

```bash
# 1) Copy this dashboard next to the bot
cp -R /path/from/agent/qa-dashboard ~/qa-automation-bot/qa-dashboard

# 2) Local demo
cd ~/qa-automation-bot/qa-dashboard
npm ci && DEMO_MODE=1 npm run db:seed && DEMO_MODE=1 INGEST_SECRET=demo-ingest-secret npm run dev

# 3) Point producer at it
export INGEST_URL=http://127.0.0.1:3000/api/ingest
export INGEST_SECRET=demo-ingest-secret   # or Keychain item

# 4) Run a QA candidate as usual (AGENTS.md), then emit finished events
```

Until the Mac bot tree + Keychain are available to the agent host, this agent can maintain the dashboard and follow the runbook from uploads, but cannot safely execute live Wrike/Shopify validations from the Cloud VM.
