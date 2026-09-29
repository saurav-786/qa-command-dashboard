#!/bin/bash
# QA Automation Bot — set up Codex on this Mac (or a new one).
# This file holds NO secrets. Tokens are stored in the macOS Keychain; you type them at a hidden prompt.
# Run:  bash setup-codex.sh
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
BOT="$HOME/qa-automation-bot"
TS="$(date +%Y%m%d-%H%M)"

echo "== 1) Skills → ~/.codex/skills"
mkdir -p "$HOME/.codex/skills"
for s in "$HERE"/skills/*/; do
  name="$(basename "$s")"
  [ -d "$HOME/.codex/skills/$name" ] && mv "$HOME/.codex/skills/$name" "$HOME/.codex/skills/$name.bak-$TS"
  cp -R "$s" "$HOME/.codex/skills/$name"
  echo "   installed $name"
done

echo "== 2) Bot folder docs"
if [ -d "$BOT" ]; then
  for f in AGENTS.md; do
    [ -f "$BOT/$f" ] && cp "$BOT/$f" "$BOT/$f.bak-$TS"
    cp "$HERE/$f" "$BOT/$f"; echo "   updated $BOT/$f (old copy: $f.bak-$TS)"
  done
  # Runbook and lessons are live files in the bot folder; copy only if missing (new machine).
  for f in QA-AUTOMATION-BOT.md QA-LESSONS.md; do
    [ -f "$BOT/$f" ] || { cp "$HERE/docs/$f" "$BOT/$f"; echo "   added $f"; }
  done
else
  echo "   $BOT not found. Copy the bot folder (lib/, scripts/, stl/, package.json) from Soumya's Mac first,"
  echo "   without runs/, logs/, state.json, auth-states/ and handoff/. Then run this script again."
fi

echo "== 3) Keychain secrets (hidden input, nothing is written to disk)"
add_secret () {  # $1 = keychain service, $2 = label, $3 = required|optional
  if security find-generic-password -s "$1" >/dev/null 2>&1; then
    echo "   $2: already in Keychain"
  else
    printf "   %s (%s) – paste value, or press Enter to skip: " "$2" "$3"
    read -rs val; echo
    if [ -n "$val" ]; then
      security add-generic-password -U -s "$1" -a "$USER" -w "$val"; echo "   $2: stored"
    else
      echo "   $2: skipped"
    fi
    unset val
  fi
}
add_secret qa-automation-bot-wrike                 "Wrike permanent token"          required
add_secret qa-automation-bot-shopify-client-id     "Shopify Admin app client id"    required
add_secret qa-automation-bot-shopify-client-secret "Shopify Admin app client secret" required
add_secret qa-automation-bot-clarity               "Microsoft Clarity token"        optional
add_secret qa-automation-bot-github                "GitHub token (read-only)"       optional

echo "== 4) Node + Playwright"
if [ -d "$BOT" ]; then
  cd "$BOT" && npm install --no-audit --no-fund && npx playwright install webkit chromium
fi

echo "== 5) Optional MCP servers for Codex"
if command -v codex >/dev/null 2>&1; then
  codex mcp add playwright -- npx @playwright/mcp@latest --browser webkit --device "iPhone 15" || true
  codex mcp add shopify-dev-mcp -- npx -y @shopify/dev-mcp@latest || true
else
  cat <<'EOF'
   codex CLI not on PATH. Add to ~/.codex/config.toml if you want these MCP servers:
   [mcp_servers.playwright]
   command = "npx"
   args = ["@playwright/mcp@latest", "--browser", "webkit", "--device", "iPhone 15"]
   [mcp_servers.shopify-dev-mcp]
   command = "npx"
   args = ["-y", "@shopify/dev-mcp@latest"]
   (Clarity MCP: add it yourself with the token from the Keychain; never paste the token into a shared file.)
EOF
fi

echo "== 6) Smoke test (read-only)"
if [ -d "$BOT" ]; then
  cd "$BOT"
  python3 lib/wrike.py candidates --trigger mention,post-release >/dev/null && echo "   Wrike: OK" || echo "   Wrike: FAILED (token?)"
  python3 lib/shopify.py markets >/dev/null 2>&1 && echo "   Shopify Admin API: OK" || echo "   Shopify Admin API: FAILED (client id/secret?)"
fi
echo "Done. Open Codex in $BOT and say: follow AGENTS.md and run the QA check."
