import { createHmac, timingSafeEqual } from "crypto";

const MAX_SKEW_MS = 5 * 60 * 1000;

export function signBody(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
}

export function verifyIngestSignature(opts: {
  secret: string;
  timestamp: string;
  signature: string;
  rawBody: string;
  nowMs?: number;
  seenEventIds?: Set<string>;
  eventId?: string;
}): { ok: true } | { ok: false; status: 401 | 409; reason: string } {
  const { secret, timestamp, signature, rawBody, eventId } = opts;
  const now = opts.nowMs ?? Date.now();
  const tsMs = Number(timestamp);
  if (!timestamp || Number.isNaN(tsMs)) {
    return { ok: false, status: 401, reason: "bad timestamp" };
  }
  if (Math.abs(now - tsMs) > MAX_SKEW_MS) {
    return { ok: false, status: 409, reason: "stale timestamp" };
  }
  const expected = signBody(secret, timestamp, rawBody);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature || "", "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, status: 401, reason: "bad signature" };
  }
  if (eventId && opts.seenEventIds?.has(eventId)) {
    return { ok: false, status: 409, reason: "replay" };
  }
  return { ok: true };
}
