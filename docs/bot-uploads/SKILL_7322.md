---
name: stl-qa-authoring
description: Author, validate and run Sportstech STL-QA journeys (YAML, natural-language steps + deterministic commerce asserts) for www.sportstech.de previews and live. Use when asked to write a QA test/journey, add a check for a Wrike task's acceptance criteria, turn a DevBot change list into tests, or run an STL suite across DE/AT/CH (and ES/FR/IT/NL) markets.
---
# STL-QA authoring

Bot folder: `~/Documents/qa-automation-bot` (read `QA-AUTOMATION-BOT.md` §11 first). CLI: `node stl/cli.ts <cmd>`; MCP server `stl-qa` exposes the same as tools.

## Steps
1. `node stl/cli.ts discover`: see existing journeys, the checker list, devices and markets.
2. Write `stl/journeys/specs/<name>.yaml`:
   ```yaml
   id: j_<words>            # required, j_ prefix
   name: <human title>
   ticket: "<wrike permalink id>"
   markets: [de, de-at, de-ch]          # add es-es, fr-fr, it-it, nl-nl for copy/translation work
   devices: [MOB-Safari, DSK-Chrome]    # also MOB-Chrome, DSK-Safari, IOS-SIM-Safari (real Mobile Safari in the Xcode iOS Simulator), AND-ADB-Chrome (adb device)
   parallel: 2                           # 1-3 workers; page loads stay serialised by the polite lock
   a11y: { runAfter: every-page, failOn: never }   # automatic axe scan (every-step | every-page)
   authState: guest                      # consent already declined (scripts/capture-auth-state.ts)
   target: { previewThemeId: "2075..." } # or pass --preview
   acceptance: true                      # failed asserts become FAIL (acceptance criteria)
   steps:
     - "Open /products/<handle>"         # or "Open Aqua Elite PDP" (resolved via runs/products.json)
     - "Select 21,5 if present"
     - "Tick 2 accessories"
     - assert: "Displayed price matches selected variant"
     - assert: "Sticky price matches main price"
     - assert: { check: price.format }
     - "Add to cart"
     - assert: "Only selected items are in the cart"
     - assert: "Cart total matches displayed price"
     - "Proceed to checkout"               # stops at page load, never enters data
   ```
3. `node stl/cli.ts validate <file>`: every `assert:` MUST map to a deterministic checker. If it doesn't, rephrase or use `{ check: <id> }`. Never invent a subjective assert. Unmapped plain steps only run with `STL_LLM=1` (planned + cached), otherwise they are reported OPEN.
4. Run: `node stl/cli.ts run <file> [--preview <id>] [--markets ..] [--devices ..] [--ticket ..] [--workers n] [--bail]`, or queue it (`node stl/cli.ts queue add <file> ...` / MCP `stl_queue_run` / the dashboard `npm run stl:serve` at http://127.0.0.1:4717). The run is polite (≥1.5 s between loads across processes) and stops at the first 429.
   Native apps: `node stl/cli.ts native <app-journey.yaml>` (tap / type / assert text / screenshot via Appium; see stl/mobile/native.ts). Test data only (`@example.invalid`), never real accounts.
5. Hand the result to triage (skill `stl-qa-result-triage`).

## Rules
- Money-path checks (price, currency, variant, sticky, cart, deeplink) are TS checkers in `stl/journeys/checks.ts` / `stl/domain/*`. Add a new checker there (with a unit test in `stl/tests/unit.test.ts` built from the real ticket) instead of weakening an assert.
- `heal.scope` may only contain UI actions. Never heal an assert.
- Keep it read-only on Shopify: no theme edits, no orders, no personal data. The cart is cleared after every run.
- Secrets never go in YAML / memory / artifacts.
