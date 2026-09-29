---
name: stl-qa-result-triage
description: Triage Sportstech STL-QA run results (result.json / spec.json / heal-log.json / junit.xml) into PASS / FAIL / DEFECT / WARN / OPEN with the release gate GO / CONDITIONAL / NO-GO and the right fleet owner. Use after an STL journey run or a Wrike preview validation, when asked "is this ready", or to decide whether a failure is a shop defect or a harness problem.
---
# STL-QA result triage

1. Summary: `node stl/cli.ts gate <runDir>/result.json` (or `runs/<id>/spec.json`, which also checks the written verdict against the findings, exit 2 if they disagree).
2. For each failed step read `detail`, `evidence`, `classification` in result.json and LOOK at the screenshot (`shot`). An automated pass does not rule out a visible problem (double currency, clipped text, overlay), and a failure can be a harness artifact.
3. Classify with the taxonomy (`node stl/cli.ts classify "<msg>" [--commerce] [--reproduced]`, MCP `stl_classify_failure`):
   - `app_bug` (commerce assert failed on ≥ 2 device/market combos) → CONFIRMED_BUG → DEFECT, or FAIL if it is an acceptance criterion. Owner Defect Bot (draft only; creating Wrike tasks needs Soumya's approval).
   - `assertion_failure` once → reproduce on a second device/market before calling it a defect.
   - `overlay_block`, `timeout`, `element_not_found`, `heal_exhausted`, `harness` → Automation Bot (fix the harness or memory). Never a shop defect.
   - `infrastructure` (429 / Cloudflare) → OPEN, no retry in the same run.
   - `needs_data` → OPEN.
4. Customer-visible issues are DEFECTS even if they are also on live (say "also on live", name markets/pages). DEFECT in the PR's changed area → NOT READY.
5. Before reporting, rule out harness causes. Past examples: a hidden add-on form read as the selected variant (Aqua Elite has 4 in DE and 17 in CH), a price tokenizer taking the next price's "CHF". Fix the harness, add a fixture test, re-run, and mark the bad run superseded.
6. Curate: `node stl/cli.ts memory curate --run <runDir>` (heal events → locator observations, findings → retest list for the next round).
7. Fleet (dry-run by default): `node stl/cli.ts fleet <runDir> --task <taskId>` writes Wrike/Teams/Token/Defect payloads. Live sends need `STL_FLEET_LIVE=1` plus Soumya's APPROVE. Teams is locked.
