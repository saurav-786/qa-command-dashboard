#!/usr/bin/env python3
"""Fire-and-forget event emitter for the QA Command Dashboard.

Stdlib only. Never prints secrets. On failure appends to logs/events-outbox.jsonl.
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

BOT_ROOT = Path(os.environ.get("BOT_PATH", Path.home() / "qa-automation-bot"))
OUTBOX = BOT_ROOT / "logs" / "events-outbox.jsonl"
KEYCHAIN_SERVICE = "qa-automation-bot-dashboard-ingest"


def _secret() -> str:
    env = os.environ.get("INGEST_SECRET")
    if env:
        return env
    try:
        out = subprocess.check_output(
            ["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=3,
        ).strip()
        return out
    except Exception:
        fallback = os.environ.get("INGEST_SECRET_FALLBACK", "")
        if fallback:
            return fallback
        # Do not silently use a demo secret in real mode — outbox instead.
        raise SystemExit(
            "No INGEST_SECRET and Keychain item "
            f"{KEYCHAIN_SERVICE} missing. Set INGEST_SECRET or store the secret."
        )


def _endpoint() -> str:
    return os.environ.get("INGEST_URL", "http://127.0.0.1:3000/api/ingest")


def _sign(secret: str, timestamp: str, body: str) -> str:
    msg = f"{timestamp}.{body}".encode("utf-8")
    return hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()


def emit(event_type: str, run_id: str, payload: dict, event_id: str | None = None, seq: int = 0) -> int:
    event = {
        "event_id": event_id or str(uuid.uuid4()),
        "type": event_type,
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "run_id": run_id,
        "seq": seq,
        "payload": payload or {},
    }
    body = json.dumps(event, separators=(",", ":"))
    secret = _secret()
    ts = str(int(time.time() * 1000))
    req = urllib.request.Request(
        _endpoint(),
        data=body.encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-QA-Timestamp": ts,
            "X-QA-Signature": _sign(secret, ts, body),
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=3) as resp:
            return int(resp.status)
    except Exception as exc:
        OUTBOX.parent.mkdir(parents=True, exist_ok=True)
        with OUTBOX.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps({"error": str(exc), "event": event}) + "\n")
        return 0


def replay() -> None:
    if not OUTBOX.exists():
        print("outbox empty")
        return
    lines = OUTBOX.read_text(encoding="utf-8").splitlines()
    kept = []
    for line in lines:
        try:
            row = json.loads(line)
            ev = row.get("event") or row
            code = emit(ev["type"], ev["run_id"], ev.get("payload") or {}, ev.get("event_id"), ev.get("seq") or 0)
            if code not in (200, 202):
                kept.append(line)
        except Exception:
            kept.append(line)
    OUTBOX.write_text("\n".join(kept) + ("\n" if kept else ""), encoding="utf-8")
    print(f"replay done; remaining={len(kept)}")


def backfill() -> None:
    """Best-effort backfill from bot runs/ when present; otherwise no-op."""
    runs = BOT_ROOT / "runs"
    if not runs.exists():
        print("no runs/ directory; nothing to backfill")
        return
    count = 0
    for spec in list(runs.glob("*/spec.json")) + list(runs.glob("*/round*/spec.json")):
        try:
            data = json.loads(spec.read_text(encoding="utf-8"))
        except Exception:
            continue
        task = spec.parent.name if spec.name == "spec.json" else spec.parent.parent.name
        round_name = "round0" if spec.name == "spec.json" else spec.parent.name
        run_id = f"bot:{task}:{round_name}"
        event_id = hashlib.sha1(f"{run_id}:finished".encode()).hexdigest()
        verdict = str(data.get("verdict") or "")
        status = "passed" if any(v in verdict for v in ("READY", "LIVE OK", "PLAN OK", "GO")) and "NOT" not in verdict else "failed"
        if "CONDITIONAL" in verdict:
            status = "passed"
        code = emit(
            "suite.finished",
            run_id,
            {
                "status": status,
                "verdict_raw": data.get("verdict_detail") or verdict,
                "suite_key": data.get("component") or task,
                "suite_name": data.get("title") or task,
                "source": "bot",
                "totals_passed": len(data.get("passed") or []),
                "totals_failed": len(data.get("fail") or []) + len(data.get("defects") or []),
            },
            event_id=event_id,
        )
        if code in (200, 202):
            count += 1
    print(f"backfill emitted={count}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("type", help="event type or replay|backfill")
    parser.add_argument("--run-id", default="")
    parser.add_argument("--json", default="{}", dest="payload_json")
    args = parser.parse_args()
    if args.type == "replay":
        replay()
        return
    if args.type == "backfill":
        backfill()
        return
    if not args.run_id:
        print("--run-id required", file=sys.stderr)
        sys.exit(2)
    payload = json.loads(args.payload_json)
    code = emit(args.type, args.run_id, payload)
    print(code or "outboxed")


if __name__ == "__main__":
    main()
