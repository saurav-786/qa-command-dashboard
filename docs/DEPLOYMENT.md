# Deploy Sportstech QA Command to Vercel (public)

Everyone on the team can open the URL. Agents push live updates via signed `POST /api/ingest`.

## Why not SQLite on Vercel?

Vercel serverless has no durable local disk for `better-sqlite3`. Production **requires Postgres** (`DATABASE_URL` from Vercel Postgres or Neon).

## 1. Database

Vercel Dashboard → Storage → Create Database → Postgres (or Neon).  
Copy the connection string as `DATABASE_URL`.

## 2. Environment variables (Production + Preview)

| Name | Value |
|---|---|
| `DATABASE_URL` | Postgres URL |
| `INGEST_SECRET` | `openssl rand -hex 32` (same value in Mac Keychain `qa-automation-bot-dashboard-ingest`) |
| `DEMO_MODE` | `0` |
| `PUBLIC_READ` | `true` |

Never set `DEMO_MODE=1` on the production deployment.

## 3. Deploy

### From GitHub (recommended)

```bash
# push this app to GitHub, then:
vercel link
vercel env pull   # optional
vercel --prod
```

Or Import the repo in [vercel.com/new](https://vercel.com/new). Framework: Next.js. Root directory: `qa-dashboard` if monorepo.

### First boot / migrations

Migrations run automatically on first API request when `DATABASE_URL` is set (`migratePg`).  
To seed **real** history, from the Mac bot (dashboard already deployed):

```bash
export INGEST_URL=https://<your-deployment>.vercel.app/api/ingest
# secret from Keychain
python3 ~/qa-automation-bot/scripts/emit_event.py backfill
```

## 4. Point agents at production

On every Mac that runs Claude / Grokbot / Codex / Cursor / the watcher:

```bash
export INGEST_URL=https://<your-deployment>.vercel.app/api/ingest
# INGEST_SECRET via Keychain item qa-automation-bot-dashboard-ingest
```

Use `scripts/dashboard-emit.sh` at suite start/finish (see `docs/REALTIME.md`).

## 5. Public access

With `PUBLIC_READ=true` (default for this deploy), anyone with the URL can view Live / History / Defects.  
Do not put customer PII or store secrets in the dashboard. Never expose Wrike tokens to the browser.

## 6. Verify

1. Open `https://<deployment>.vercel.app` — no DEMO banner  
2. `curl -s https://<deployment>.vercel.app/api/queue | jq`  
3. Emit a test event from the Mac → Live strip / history updates within a few seconds  

## SSE note

`/api/stream` closes by ~50s with `retry: 3000`; the browser reconnects. This is required under Vercel’s serverless limits.
