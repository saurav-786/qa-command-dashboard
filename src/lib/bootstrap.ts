export { getDb, isDemoMode, migrate, nextEventSeq } from "./db";
import { isDemoMode } from "./db";
import { ensureDemoSeeded } from "./seed";

let seeded = false;

export function ensureDemoSeededIfNeeded(): void {
  if (!isDemoMode() || seeded) return;
  ensureDemoSeeded();
  seeded = true;
}
