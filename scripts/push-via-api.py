#!/usr/bin/env python3
"""Push this directory to GitHub using the Contents/Git Data API (works with classic PATs).

Usage:
  GH_TOKEN=ghp_... python3 scripts/push-via-api.py saurav-786/qa-command-dashboard main

Never prints the token.
"""
from __future__ import annotations

import base64
import json
import mimetypes
import os
import pathlib
import sys
import urllib.error
import urllib.request

SKIP_DIRS = {".git", "node_modules", ".next", "data"}
SKIP_SUFFIX = {".png", ".webp", ".jpg", ".jpeg", ".gif"}


def api(token: str, method: str, url: str, body: dict | None = None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
            "User-Agent": "qa-command-dashboard-push",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        err = e.read().decode(errors="replace")
        raise SystemExit(f"HTTP {e.code} {url}: {err[:500]}")


def main() -> None:
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if not token:
        raise SystemExit("Set GH_TOKEN")
    if "=" in token and token.split("=", 1)[0].endswith("TOKEN"):
        token = token.split("=", 1)[1].strip()
    repo = sys.argv[1] if len(sys.argv) > 1 else "saurav-786/qa-command-dashboard"
    branch = sys.argv[2] if len(sys.argv) > 2 else "main"
    owner, name = repo.split("/", 1)
    root = pathlib.Path.cwd()

    files: list[tuple[str, bytes]] = []
    for p in root.rglob("*"):
        if any(part in SKIP_DIRS for part in p.parts):
            continue
        if not p.is_file():
            continue
        if p.suffix.lower() in SKIP_SUFFIX and p.name != "favicon.ico":
            continue
        rel = str(p.relative_to(root)).replace("\\", "/")
        files.append((rel, p.read_bytes()))
    files.sort(key=lambda x: x[0])
    print(f"collect {len(files)} files")

    base = f"https://api.github.com/repos/{owner}/{name}"
    _, ref = api(token, "GET", f"{base}/git/ref/heads/{branch}")
    base_sha = ref["object"]["sha"]
    _, base_commit = api(token, "GET", f"{base}/git/commits/{base_sha}")
    base_tree = base_commit["tree"]["sha"]

    tree_items = []
    for path, content in files:
        _, blob = api(
            token,
            "POST",
            f"{base}/git/blobs",
            {
                "content": base64.b64encode(content).decode(),
                "encoding": "base64",
            },
        )
        tree_items.append(
            {"path": path, "mode": "100644", "type": "blob", "sha": blob["sha"]}
        )
        if len(tree_items) % 20 == 0:
            print(f"  blobs {len(tree_items)}/{len(files)}")

    _, tree = api(
        token,
        "POST",
        f"{base}/git/trees",
        {"base_tree": base_tree, "tree": tree_items},
    )
    _, commit = api(
        token,
        "POST",
        f"{base}/git/commits",
        {
            "message": "feat: Sportstech QA Command Dashboard (full Cloud build)",
            "tree": tree["sha"],
            "parents": [base_sha],
        },
    )
    api(
        token,
        "PATCH",
        f"{base}/git/refs/heads/{branch}",
        {"sha": commit["sha"], "force": True},
    )
    print(f"pushed {commit['sha'][:8]} -> {owner}/{name}@{branch}")
    print(f"https://github.com/{owner}/{name}")


if __name__ == "__main__":
    main()
