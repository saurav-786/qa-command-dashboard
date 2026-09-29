---
name: stl-qa-debug-fix
description: Debug and fix failing Sportstech STL-QA journeys or checkers (heal exhausted, locator drift, overlay blocks, false positives in price/currency checks, rate limits) and produce root-cause bundles for Shopify theme failures. Use when an STL run fails and the cause is unclear, when a checker gives a false positive, or when asked for an RCA of a theme bug.
---
# STL-QA debug & fix

## Harness failures
1. `node stl/cli.ts memory list --tag overlay` / MCP `stl_list_memory`: is the blocking overlay known? If not, add an observation to `stl-memory/products/sportstech-de/overlays.md` (role+name locator; always the decline/privacy option).
2. heal_exhausted: check `heal-log.json`; the aria scan tried the intent words. Give the step better `candidates:` or a quoted label ("click \"Zum Warenkorb\""). Successful heals are cached (`node stl/cli.ts cache stats`) and curated into `stl-memory/suites/healed-locators/`. Promote stable ones into the checker/page helper.
3. False positive in a checker: reproduce with a tiny probe script inside the bot folder (one page load), fix the checker or `stl/domain/*`, add the real markup as a unit fixture (`stl/tests/unit.test.ts`) or to `stl/tests/fixtures/shop.html`, run `npm run test:unit`, then re-run the journey.
4. Never loosen a money-path assert to make it green. Only fix how the value is read.
5. 429 / challenge: stop. The breaker in `stl/core/net.ts` trips for the whole run. Wait ≥ 1 h (see memory obs_rate_limit).

## Real devices
- IOS-SIM-Safari fails to open → `xcrun simctl list devices` (Xcode must be installed; set STL_IOS_SIM to a device name). Only one Simulator Safari session runs at a time (the runner serialises it).
- AND-ADB-Chrome → `adb devices` must list a device/emulator with Chrome; otherwise the combo is OPEN (needs_data).

## Theme root cause
`node stl/cli.ts rca <runDir>` writes `rca.md` with one bundle per failed step: checker, observed values, market/device, theme id, JS errors and likely theme files (`stl/rca/rca.ts` THEME_MAP). Work it read-only against `sportstechbrands/shop-theme` or the PR diff and give DevBot the smallest fix plus the checker id that guards it. With `STL_LLM=1` a model draft is added (tokens logged to the ledger). Providers (`STL_LLM_PROVIDER`): anthropic, openai (any OpenAI-compatible server via STL_OPENAI_BASE_URL, e.g. Ollama), gemini, claude-code (the Claude Code subscription via `claude -p`), codex. Check one with `node stl/cli.ts llm test --provider <p>`.
