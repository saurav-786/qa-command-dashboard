import { NextRequest, NextResponse } from "next/server";
import { verifyIngestSignature } from "@/lib/hmac";
import { applyEvents, reprojectAll } from "@/lib/ingest";
import { isDemoMode } from "@/lib/db";
import type { IngestEvent } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const secret = process.env.INGEST_SECRET || (isDemoMode() ? "demo-ingest-secret" : "");
  if (!secret) {
    return NextResponse.json({ error: "INGEST_SECRET not configured" }, { status: 503 });
  }
  const timestamp = req.headers.get("x-qa-timestamp") || "";
  const signature = req.headers.get("x-qa-signature") || "";

  let body: { event_id?: string; events?: IngestEvent[] } & Partial<IngestEvent>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 422 });
  }

  const check = verifyIngestSignature({
    secret,
    timestamp,
    signature,
    rawBody,
  });
  if (!check.ok) {
    return NextResponse.json({ error: check.reason }, { status: check.status });
  }

  // Signed maintenance command: rebuild runs from stored events (same HMAC as ingest).
  if ((body as { reproject?: boolean }).reproject === true) {
    return NextResponse.json(await reprojectAll(), { status: 200 });
  }

  const events: IngestEvent[] = body.events
    ? body.events.slice(0, 200)
    : body.event_id && body.type && body.run_id
      ? [
          {
            event_id: body.event_id,
            type: body.type,
            ts: body.ts || new Date().toISOString(),
            run_id: body.run_id,
            seq: body.seq || 0,
            payload: (body.payload as Record<string, unknown>) || {},
          },
        ]
      : [];

  if (!events.length) {
    return NextResponse.json({ error: "no events" }, { status: 422 });
  }

  const result = await applyEvents(events);
  return NextResponse.json(result, { status: 202 });
}
