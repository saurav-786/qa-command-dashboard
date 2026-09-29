import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { defectFingerprint, normaliseTitle } from "./fingerprint";

describe("fingerprint", () => {
  it("normalises prices and ids away", () => {
    const a = normaliseTitle("Price €1,099.00 on /de-ch PDP 4561361234");
    const b = normaliseTitle("Price on PDP");
    assert.equal(a.includes("1099"), false);
    assert.ok(a.includes("price"));
    assert.ok(b.includes("price"));
  });

  it("is stable for equivalent titles", () => {
    const f1 = defectFingerprint("ROM graph stalls after pause 12s", "verify_rom", "console");
    const f2 = defectFingerprint("ROM graph stalls after pause 99s", "verify_rom", "console");
    assert.equal(f1, f2);
  });
});
