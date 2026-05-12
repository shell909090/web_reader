#!/usr/bin/env bash
# Smoke test: verify HN and BBC produce expected output.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "[smoke] Running HN list (limit=10)..."
node --import tsx "$ROOT/read.ts" -s hn -n 10 -o "$TMP/hn.json"

COUNT=$(node -e "const d=JSON.parse(require('fs').readFileSync('$TMP/hn.json','utf8')); console.log(d.filter(x=>x.source==='hn').length)")
if [ "$COUNT" -lt 10 ]; then
  echo "[smoke] FAIL: expected >= 10 hn items, got $COUNT" >&2; exit 1
fi
echo "[smoke] OK: hn list → $COUNT items"

echo "[smoke] Running BBC detail (2 articles)..."
node --import tsx "$ROOT/read.ts" -s bbc -n 2 2>/dev/null | \
  node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); process.stdout.write(d.slice(0,2).map(i=>i.url).join('\n')+'\n')" | \
  node --import tsx "$ROOT/read.ts" -o "$TMP/bbc.md"

if [ ! -s "$TMP/bbc.md" ]; then
  echo "[smoke] FAIL: bbc.md is empty" >&2; exit 1
fi
echo "[smoke] OK: bbc detail → $(wc -c < "$TMP/bbc.md" | tr -d ' ') bytes"

echo "[smoke] Running wiki query..."
node --import tsx "$ROOT/read.ts" -q wiki transformer -n 5 -o "$TMP/wiki.json"
WCOUNT=$(node -e "const d=JSON.parse(require('fs').readFileSync('$TMP/wiki.json','utf8')); console.log(d.length)")
if [ "$WCOUNT" -lt 1 ]; then
  echo "[smoke] FAIL: wiki query returned 0 results" >&2; exit 1
fi
echo "[smoke] OK: wiki query → $WCOUNT results"

echo "[smoke] All smoke tests passed."
