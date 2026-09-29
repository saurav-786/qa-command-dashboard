import fs from "fs";
import { applyEvents } from "../src/lib/ingest";
import type { IngestEvent } from "../src/lib/types";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run import:events -- <events.json>");
  process.exit(2);
}
const raw = JSON.parse(fs.readFileSync(file, "utf8"));
const events: IngestEvent[] = Array.isArray(raw) ? raw : raw.events || [raw];
console.log(applyEvents(events));
