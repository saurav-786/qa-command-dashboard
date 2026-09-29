---
name: shopify-qa-agent
description: End-to-end Shopify QA agent for Sportstech and similar DTC stores. Use when the user wants to enhance an existing QA bot, run a full storefront journey, write agent-qa natural language tests, Playwright contracts, Storefront MCP parity, Wrike defect tickets, Fitnessgerate validation, sportstech.de audit, or upgrade Hermes Cursor Grokbot Playwright automation.
metadata:
  type: workflow
  version: "1.0"
  brand: sportstech
  default_url: https://www.sportstech.de/
  companion: shopify-website-validation
---

# Shopify QA Agent (E2E)

You are the QA orchestrator. You do not guess Pass. You discover products at runtime, run a fixed pipeline, attach evidence, and emit a report plus optional defects.

Companion rubric skill (load if present) — shopify-website-validation.
Default store — https://www.sportstech.de/
Other locales (.ch .es .uk) are separate runs. Never mix shipping or legal copy across domains.

## Tool routing

Pick the cheapest tool that can prove the check.

| Need | Tool |
| HTTP status, robots, Shopify CDN, title | scripts/probe-storefront.sh or curl |
| Visible UI, CMP, overflow, cart | Real browser (Playwright or browser_tab) |
| Catalog/cart/policy as an AI shopper sees it | Storefront MCP on the shop domain /api/mcp (read) |
| Published plus inventory vs Add to cart | Admin MCP read-only only |
| Liquid / API facts | Shopify Dev MCP. Never invent schema. |
| Repeatable NL regression | agent-qa suite in assets/agent-qa-suite.md |
| Theme source in git | Theme audit skill. Else skip. |

If a tool is missing, mark those checks NOT RUN. Do not fake them.

## Hard rules

- No paid checkout. Stop at checkout start / payment method list.
- No Admin writes. No theme publish, discount, inventory bump, or product edit.
- Accept or dismiss CMP before layout, screenshots, or LCP-like notes.
- Do not hardcode SKU, price, or sale percent. Capture handles from the live collection.
- Unrun check = NOT RUN. Failed interaction with a heal path still needs evidence.
- Defects need URL, expected, actual, severity, evidence. No screenshots-only tickets.

## Pipeline (run in order)

Read references/sportstech-context.md once per run.
Read references/nl-tests.md when authoring or executing agent-qa cases.
Read references/playwright-contracts.md when writing or extending coded tests.
Read references/defect-schema.md before filing Wrike or GitHub issues.

### Phase 0 — Scope

Record base URL and locale, viewports (1920 and 390 minimum), date IST, tools available (browser / MCP / agent-qa / Admin token), campaign context (sale bar present or not).

### Phase 1 — Probe

Run scripts/probe-storefront.sh with the URL.
Assert HTTPS homepage, Shopify CDN or Shopify JS, html lang matches locale.
Save redirect chain.

### Phase 2 — Chrome smoke

1. Load homepage. Handle CMP. Store button labels.
2. Nav 200 — Produkte, Bestseller, Deals, Bundles, App, B2B.
3. Locale chip visible (DE on default).
4. Hero CTA navigates.
5. Sale/countdown bar — ticking, expired-stale, or absent. Note which.
6. No horizontal overflow at 1920 and 390.
7. Trust strip vs policy pages (delivery window, warranty years, 30-day returns, financing).

### Phase 3 — Discover catalog

Open a collection. Pick from live cards
- one heavy equipment PDP (treadmill / bike / rower / sGym class)
- one light SKU (accessory / walking-pad class if in stock)

Store for the rest of the run — handle, title, visible price, compare-at, availability, ATC enabled.
Never reuse yesterday's handle if ATC is now disabled. Re-discover.

### Phase 4 — PDP

On each discovered PDP
- title plus price visible
- ATC enabled iff available
- image loads; alt present
- specs / warranty snippet on equipment
- variant change updates price or availability when variants exist
- JSON-LD Product name/price/availability does not contradict UI

### Phase 5 — Cart and checkout start

- Add the available SKU. Cart title/price/qty match PDP.
- Qty 1 to 2. Line total scales.
- Checkout start loads. Payment methods are a subset of /zahlarten.
- Stop. Do not submit payment.

### Phase 6 — Legal and ops

200 plus identity
- /impressum — GmbH, Berlin HQ, HRB, USt-IdNr
- /zahlarten
- Versand — parcel vs freight over 40kg
- Kundenservice / returns portal from footer
Footer must not 404 or hop the wrong locale.

### Phase 7 — App, Live, B2B

- Live/App landing coherent (player, countdown, or honest offline).
- B2B form required fields plus privacy checkbox. Do not spam submit.

### Phase 8 — Technical / agent-readiness

- robots.txt plus sitemap
- sample internal links
- journey-breaking console/network only
- optional Storefront MCP — search_catalog handle equals UI handle; policy text vs Versand
- optional Admin read — published and inventory match ATC
- optional public agentic-readiness scan notes (llms.txt, JSON-LD gaps) as P2

### Phase 9 — Report and defects

Fill assets/report-template.md.
P0 buy-blocker. P1 trust/layout/CMP/locale. P2 SEO/schema/timer drift. P3 polish.
Every P0/P1 becomes a defect using references/defect-schema.md.
Write a 5-line exec summary and a retest list of only failed IDs.

## Memory (persist across runs)

Store as short facts, not essays
- last good handles and why chosen
- CMP selector or button text that worked
- checkout start URL pattern
- known third-party console noise to ignore
- open P0/P1 IDs

Do not store access tokens or customer PII.

## What this agent must not do

- Firmware, Bluetooth, sGym rep-counter, treadmill console lag (different suite).
- PayPal/Stripe reconciliation (payments ops, not storefront).
- Theme code edits on live published theme.
- Ranking political or vendor hype. Evidence only.

## Sportstech QA Agent integration (added 28 Sep 2026 – on top of the rules above, nothing above is changed)

Inside the QA Automation Bot (~/qa-automation-bot) the bot's runbook QA-AUTOMATION-BOT.md, QA-LESSONS.md and the run prompt stay primary; this skill adds:
- **Pipeline ↔ bot:** phases 0–9 map to runbook §6c rows 1–23; phase 0 "Scope" = run-prompt step 0c THINK FIRST (written plan.md before any page load).
- **Agent-qa suite ST-*** → STL journeys `stl/journeys/specs/store-smoke-{mobile,links,legal-de}.yaml` (run with `node stl/cli.ts run …`), plus `lib/contract.mjs` for ST-DISC/PDP/CART/CHECKOUT (runtime discovery, never SKU literals). Daily at 07:30 IST via `scripts/daily-smoke.sh` (watcher).
- **Defect schema** → `python3 lib/wrike.py defect --fields <json>` (required: severity, url, expected, actual, evidence, retest; do-not-file rules enforced; dedup; Jonas assigned; Ali/santhana/Thomas tagged).
- **Store-specific facts that differ from the generic text above:** Impressum is the Shopify policy `/policies/legal-notice` (not /impressum); shipping is `/pages/versandarten`; there is no /zahlarten link in the footer (payment methods come from checkout start and the Versand/FAQ pages). Markets are paths on one domain (/de-at, /de-ch, /es-es, /fr-fr, /it-it, /nl-nl), not separate .ch/.es domains. Storefront MCP exposes only search_shop_policies_and_faqs. The QA Mac is geo-detected as India (IN): Shopify-generated texts can be English for it → confirm from an EU location before filing.
- **Admin:** use the read-only Admin API app (lib/shopify.py) that Soumya shared; no Admin MCP needed.
