import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { signBody, verifyIngestSignature } from "./hmac";

describe("hmac", () => {
  it("accepts a valid signature", () => {
    const secret = "demo-ingest-secret";
    const timestamp = String(Date.now());
    const rawBody = '{"event_id":"e1"}';
    const signature = signBody(secret, timestamp, rawBody);
    const res = verifyIngestSignature({ secret, timestamp, signature, rawBody });
    assert.equal(res.ok, true);
  });

  it("rejects stale timestamps", () => {
    const secret = "demo-ingest-secret";
    const timestamp = String(Date.now() - 10 * 60_000);
    const rawBody = "{}";
    const signature = signBody(secret, timestamp, rawBody);
    const res = verifyIngestSignature({ secret, timestamp, signature, rawBody });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.status, 409);
  });
});
