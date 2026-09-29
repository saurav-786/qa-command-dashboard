import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatDuration, formatIst } from "./ist";

describe("ist", () => {
  it("formats UTC as IST with label", () => {
    const s = formatIst("2026-09-18T16:10:00.000Z");
    assert.match(s, /IST$/);
    assert.match(s, /2026-09-18/);
  });

  it("formats duration", () => {
    assert.equal(formatDuration(12 * 60_000 + 34_000), "12m 34s");
  });
});
