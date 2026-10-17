#!/usr/bin/env bash
# Run the frontend checks in parallel: type check, lint on changed files, unit tests.
# Usage: scripts/check.sh [--build]   (--build also runs `npm run build` after the checks)
set -uo pipefail
cd "$(dirname "$0")/.."

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

changed="$(git diff --name-only origin/selfhosted... -- '*.ts' '*.tsx' 2>/dev/null | tr '\n' ' ')"

run() { # name, command...
  local name="$1"; shift
  ( "$@" >"$tmp/$name.log" 2>&1; echo $? >"$tmp/$name.rc" ) &
}

run types npx tsc --noEmit
run tests npx vitest run
if [ -n "$changed" ]; then run lint npx eslint $changed; fi
wait

fail=0
for rc in "$tmp"/*.rc; do
  name="$(basename "$rc" .rc)"
  if [ "$(cat "$rc")" = "0" ]; then
    echo "ok    $name"
  else
    echo "FAIL  $name"; tail -20 "$tmp/$name.log"; fail=1
  fi
done

if [ "$fail" = 0 ] && [ "${1:-}" = "--build" ]; then
  npm run build >"$tmp/build.log" 2>&1 && echo "ok    build" || { echo "FAIL  build"; tail -20 "$tmp/build.log"; fail=1; }
  git checkout public/__env.js 2>/dev/null || true
fi
exit "$fail"
