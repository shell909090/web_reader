#!/usr/bin/env bash
# Smoke test: verify HN and BBC produce expected output files.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATE="$(date +%Y%m%d)"
OUT="$ROOT/data/smoke-test"
OUT_DATE="$OUT/$DATE"

cleanup() {
  rm -rf "$OUT"
}
trap cleanup EXIT

echo "[smoke] Running HN list (limit=10)..."
node --import tsx "$ROOT/news.ts" --sources hn --mode list --limit 10 --out "$OUT"

INDEX_JSON="$OUT_DATE/index.json"
if [ ! -f "$INDEX_JSON" ]; then
  echo "[smoke] FAIL: $INDEX_JSON not found" >&2
  exit 1
fi

COUNT=$(node -e "const d=JSON.parse(require('fs').readFileSync('$INDEX_JSON','utf8')); console.log(d.filter(x=>x.source==='hn').length)")
if [ "$COUNT" -lt 10 ]; then
  echo "[smoke] FAIL: expected >= 10 hn items, got $COUNT" >&2
  exit 1
fi
echo "[smoke] OK: hn list → $COUNT items"

echo "[smoke] Running BBC detail (limit=2)..."
node --import tsx "$ROOT/news.ts" --sources bbc --mode detail --limit 2 --out "$OUT"

MD_COUNT=$(find "$OUT_DATE" -name 'bbc-*.md' | wc -l | tr -d ' ')
if [ "$MD_COUNT" -lt 2 ]; then
  echo "[smoke] FAIL: expected >= 2 bbc markdown files, got $MD_COUNT" >&2
  exit 1
fi
echo "[smoke] OK: bbc detail → $MD_COUNT markdown files"

if [ -f "$OUT_DATE/_errors.log" ]; then
  ERR_COUNT=$(wc -l < "$OUT_DATE/_errors.log" | tr -d ' ')
  echo "[smoke] WARN: _errors.log has $ERR_COUNT error(s)" >&2
fi

echo "[smoke] All smoke tests passed."
