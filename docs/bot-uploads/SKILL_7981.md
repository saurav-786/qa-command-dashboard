---
name: shopify-website-validation
description: Run Shopify storefront QA and website validation for Sportstech and similar fitness DTC shops. Use when the user asks for Shopify website validation, storefront QA, Fitnessgerate QA report, sportstech.de audit, PDP cart checkout smoke, cookie CMP, mobile overflow, SEO schema, or upgrading a Playwright QA agent.
metadata:
  type: workflow
  version: "1.0"
  brand: sportstech
  default_url: https://www.sportstech.de/
---

# Shopify Website Validation

Validate a live Shopify storefront as a QA agent. Default target is Sportstech DE (https://www.sportstech.de/). Do not hardcode SKUs, prices, or sale percentages. Discover them at runtime.

## When this skill is active

1. Confirm base URL (default Sportstech DE). Other locales are separate runs.
2. Read references/sportstech.md for brand-specific pages and failure modes.
3. Read references/check-matrix.md for the check catalog and severity.
4. Execute checks in this order — smoke first, then deep.
5. Write the report from assets/report-template.md. Never invent passing checks.

## Hard rules

- Treat the public storefront as source of truth. Admin MCP is optional and read-only.
- Dismiss or accept the cookie banner before measuring layout or screenshots. Record CMP copy and button labels.
- Do not complete paid checkout. Stop after checkout start / payment method list.
- Do not write to Shopify Admin. No product edits, discounts, or theme publishes.
- Mark any check not actually executed as NOT RUN, never Pass.
- Prefer evidence — URL, selector or text, HTTP status, screenshot note.

## Execution order

### 0. Probe

- GET homepage, follow redirects. Expect https://www.sportstech.de/.
- Confirm Shopify signals — cdn.shopify.com in HTML or window.Shopify if a browser is available.
- Capture title, html lang, robots/canonical if present.
- Optional — scripts/probe-storefront.sh URL for status, title, Shopify CDN, robots.

### 1. Browser smoke

Use a real browser when available.

Homepage
- Sale or countdown bar visible and ticking, or absent — record which.
- Primary nav — Produkte, Bestseller, Deals, Bundles, App, B2B.
- Locale control (DE) present.
- Hero CTA works.
- Cookie CMP — Accept / Settings / Decline. After accept, banner gone and no layout jump covering nav.
- No horizontal overflow at 1920 and 390 widths.

Trust strip
- Free delivery window, warranty years, 30-day returns, financing — text matches legal pages, not leftover campaign copy.

### 2. Catalog discovery (no hardcoded SKUs)

- Open Produkte or a collection. Record first 3 in-stock product handles and titles.
- Open one treadmill-class PDP and one accessory or light SKU if both exist.
- On each PDP assert title, price vs compare-at, primary image, add-to-cart enabled if available, spec bullets, reviews or rating, shipping/returns snippet.
- Variant change (if any) updates price and availability.

### 3. Cart and checkout start

- Add one available product. Cart drawer or /cart shows same title, price, qty.
- Update qty 1 to 2. Line total scales.
- Proceed to checkout start. Record payment methods listed vs /zahlarten.
- Do not submit payment.

### 4. Legal and ops pages (DE)

Must 200 and show company identity
- /impressum — GmbH name, Berlin address, HRB, USt-IdNr.
- /zahlarten — Lastschrift, card, PayPal variants.
- Versand page — parcel vs freight (over 40kg), free shipping claim.
- Kundenservice / returns portal link works.
- Footer links match these paths (no 404, no locale mismatch).

### 5. App / Live / B2B

- App and Sportstech Live landing load. Countdown or offline state is coherent.
- B2B / Business form — required fields, privacy checkbox, submit does not 500. Do not spam.

### 6. Technical

- robots.txt allows Googlebot; note AI crawler rules.
- Sitemap reachable.
- PDP JSON-LD Product present; name/price/availability not contradictory with visible UI.
- Images have alt on sampled PDPs and collection cards.
- Console — note only errors that break the journey.

### 7. Optional Admin / MCP cross-check (read-only)

If a read-only Admin or Storefront MCP is connected
- Same handle — published status and inventory match Add to cart enabled.
- Policy MCP text vs Versand/Returns pages.
- Never enable write tools in this skill.

## Report

Copy assets/report-template.md. Fill every section.

- P0 — cannot buy (cart/checkout/ATP broken, 5xx homepage).
- P1 — trust/legal mismatch, major layout break, wrong locale, CMP blocking.
- P2 — SEO/schema, alt text, console noise, promo timer copy drift.
- P3 — polish.

End with a 5-line executive summary and a retest list.

## Agent upgrades this skill expects

Wire these next to the validator; do not duplicate their docs here
- Shopify Dev MCP for Liquid/API facts.
- Storefront MCP for catalog/cart/policy parity.
- Theme audit skills for Liquid-level SEO/CWV when theme code is in repo.
- Playwright contract tests — discover products via collection JSON, assert UI against the same entity.

## Sportstech QA Agent integration (added 28 Sep 2026 – on top of the rules above, nothing above is changed)

When this skill runs inside the Sportstech QA Automation Bot (~/qa-automation-bot), the bot's runbook QA-AUTOMATION-BOT.md and QA-LESSONS.md stay the primary rules; this skill ADDS checks:
- **Scope widening:** run every check in all 7 markets (/, /de-at, /de-ch, /es-es, /fr-fr, /it-it, /nl-nl) with the market's browser language (locale + Accept-Language), not only DE. Legal-page paths differ per market – discover them from the footer instead of assuming /impressum, /zahlarten.
- **Read-only Admin API is allowed** (lib/shopify.py, no writes) in addition to the public storefront; it is the source of truth for prices per market, stock and translations.
- **Severity mapping to the bot's grading:** P0 → FAIL/DEFECT that blocks buying; P1 → DEFECT (customer-visible); P2 → WARN (or DEFECT if customer-visible wrong data); P3 → WARN. NOT RUN → OPEN.
- **Wire-ups now available:**
  - Shopify Dev MCP (`shopify-dev-mcp`, user MCP config) – Liquid/Admin/Storefront API facts when judging theme code or a Shopify Bot claim.
  - Storefront MCP (`sportstech-storefront`, https://www.sportstech.de/api/mcp) – on this shop only `search_shop_policies_and_faqs` is enabled; use `python3 lib/policy_parity.py` to compare its answers with the shipping / returns / warranty / payment pages and the homepage trust strip.
  - Contract tests (`node lib/contract.mjs`) – collection JSON → product .js → rendered PDP → /cart/add.js → /cart.js must be the SAME entity (handle, variant id, title, price in the market currency, availability ⇔ add-to-cart enabled), per market; cart cleared afterwards.
- **Report:** the bot keeps its own report (lib/report.py, PDF, Wrike comment); put this skill's scorecard areas into spec.json "passed/warn/defects/open" instead of a second report.
