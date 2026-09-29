import { createHash } from "crypto";

/** Normalise defect titles: strip numbers/prices/ids/dates, collapse space, drop locale prefixes. */
export function normaliseTitle(title: string): string {
  let t = title.toLowerCase();
  t = t.replace(/\b(de-at|de-ch|es-es|fr-fr|it-it|nl-nl|\/de\/)\b/g, " ");
  t = t.replace(/https?:\/\/\S+/g, " ");
  t = t.replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ");
  t = t.replace(/[€$£]\s?[\d.,]+/g, " ");
  t = t.replace(/\b[\d.,]+\s?(eur|usd|chf|€)\b/gi, " ");
  t = t.replace(/\b\d+\b/g, " ");
  t = t.replace(/[^a-z\s|/.-]+/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

export function defectFingerprint(
  title: string,
  caseKey: string | null | undefined,
  area: string | null | undefined,
): string {
  const base = `${normaliseTitle(title)}|${(caseKey || "").toLowerCase()}|${(area || "other").toLowerCase()}`;
  return createHash("sha1").update(base).digest("hex");
}
