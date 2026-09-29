# Agent instructions — Sportstech QA Command + QA Automation Bot

You may act in two modes:

## A) Dashboard maintainer (this repo)
Work in `qa-dashboard/`. Keep the dark ops Command Console updating via signed ingest events.

**Real-time (default):** never invent data. Agents + watcher push events.

```bash
# .env.local must have DEMO_MODE=0 and INGEST_SECRET=…
npm run db:migrate
npm run dev:real
```

**Demo only (isolated fake DB):**

```bash
npm run db:seed
npm run dev:demo
```

See `docs/REALTIME.md`.

## B) QA Automation Bot (same role as Claude Code / Grokbot / Codex)
Only when `~/qa-automation-bot` exists on the host (Mac with Keychain tokens).

1. Read `~/qa-automation-bot/AGENTS.md` and `QA-AUTOMATION-BOT.md` first (copies under `docs/bot-uploads/` if the live tree is missing).
2. Read `QA-LESSONS.md` and apply matching lessons.
3. Never run if `logs/qa-run.lock` exists.
4. Secrets stay in macOS Keychain (`qa-automation-bot-wrike`, Shopify client id/secret, …). Never print or commit them.
5. Read-only on Shopify. No orders/payments/PII. Checkout page load is the furthest step; clear cart after.
6. After each suite, emit dashboard events:

```bash
python3 <this-repo>/producer/emit_event.py suite.started --run-id bot:<task>:<round> --json '...'
python3 <this-repo>/producer/emit_event.py suite.finished --run-id bot:<task>:<round> --json '...'
```

Set `INGEST_URL` to the deployed `/api/ingest` and store `INGEST_SECRET` in Keychain item `qa-automation-bot-dashboard-ingest`.

## Hard rules (all modes)
- No customer/order/PII data in the dashboard.
- No Wrike writes from the dashboard; only the bot’s `wrike.py` writes.
- Fixtures use Demo User / Demo Bot names only.
- Status always text + icon + colour.

See `docs/qa-bot-capability.md` for the capability matrix vs Claude Code / Grokbot / Codex.
