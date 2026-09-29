# Run on your Mac (not the Cloud Agent path)

`/agent/qa-dashboard` exists only inside the Cursor Cloud Agent VM.  
On your Mac the app lives at:

```bash
~/qa-automation-bot/qa-dashboard
```

Your current folder is the **older** dashboard (it has `next dev` but no `db:seed`).  
Use one of the options below to get the **Command Dashboard** build.

## Option A — pull from GitHub (preferred)

If the remote `saurav-786/qa-command-dashboard` (or `qa-dashboard`) exists:

```bash
cd ~/qa-automation-bot
mv qa-dashboard qa-dashboard.bak-$(date +%Y%m%d)
git clone https://github.com/saurav-786/qa-command-dashboard.git qa-dashboard
cd qa-dashboard
npm ci
DEMO_MODE=1 npm run db:seed
DEMO_MODE=1 INGEST_SECRET=demo-ingest-secret npm run dev
```

Open http://localhost:3000

## Option B — overlay from a tarball

```bash
cd ~/qa-automation-bot
# after you copy qa-command-dashboard.tgz onto the Mac (Downloads, AirDrop, etc.)
mkdir -p qa-dashboard-command
tar -xzf ~/Downloads/qa-command-dashboard.tgz -C qa-dashboard-command --strip-components=1
# keep a backup of the old app
mv qa-dashboard qa-dashboard.bak-$(date +%Y%m%d)
mv qa-dashboard-command qa-dashboard
cd qa-dashboard
npm ci
DEMO_MODE=1 npm run db:seed
DEMO_MODE=1 INGEST_SECRET=demo-ingest-secret npm run dev
```

## Verify

```bash
npm test
npm run smoke   # requires the dev server running
```

You should see the **DEMO DATA** banner, KPIs, live execution, queue, and history.

## Notes

- Do **not** `cd /agent/qa-dashboard` on the Mac — that path is Cloud-only.
- Nested under `qa-automation-bot/`, Next may warn about two lockfiles; `outputFileTracingRoot` is set to this app folder to silence it.
- For real bot → dashboard updates later: set `INGEST_URL` and Keychain item `qa-automation-bot-dashboard-ingest`, then hook `producer/emit_event.py` from the watcher.
