# Architektur — QA Command Dashboard

Kurzfassung (DE): Die Bot-Dateien auf dem Mac bleiben die Quelle der Wahrheit. Das Dashboard hält eine **Projektion** in SQLite/Postgres, die über signierte Events (`POST /api/ingest`) aufgebaut wird.

- Live: SSE `/api/stream` (max. ~50–55 s, Client reconnect mit `Last-Event-ID`), Fallback Polling.
- History: nie überschreiben; stabile Run-IDs `bot:…` / `stl:…` / `ci:…` / `demo:…`.
- Wrike: nur lesend (Producer-Sync bevorzugt); Dashboard schreibt nicht nach Wrike.
- DEMO_MODE: sichtbares Banner, `source=demo`, Simulator nur dann aktiv.

Siehe auch `docs/command-dashboard-inspection.md` und `README.md`.
