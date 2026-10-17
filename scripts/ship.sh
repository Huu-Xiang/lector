#!/usr/bin/env bash
# Push HEAD to selfhosted, wait for the image build, deploy it, and check the site.
# Run it only after the owner approved the push and deploy.
# Needs READFOX_HOST (user@host of the server) and optionally READFOX_KEY (default ~/.ssh/id_ed25519).
set -euo pipefail
cd "$(dirname "$0")/.."

host="${READFOX_HOST:?set READFOX_HOST, for example user@server}"
key="${READFOX_KEY:-$HOME/.ssh/id_ed25519}"
repo="Huu-Xiang/lector"
site="${READFOX_SITE:-https://readfox.app}"
sha="$(git rev-parse HEAD)"

git fetch -q origin
git merge-base --is-ancestor origin/selfhosted HEAD || { echo "HEAD is not ahead of origin/selfhosted; rebase first" >&2; exit 1; }

for i in 1 2 3; do
  git push origin HEAD:selfhosted && break
  sleep 8
done
git fetch -q origin
[ "$(git rev-parse origin/selfhosted)" = "$sha" ] || { echo "push did not land" >&2; exit 1; }

echo "waiting for the build of ${sha:0:7}"
run=""
for i in $(seq 1 12); do
  run="$(gh run list --repo "$repo" --branch selfhosted --commit "$sha" --workflow "Build image" --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)"
  [ -n "$run" ] && break
  sleep 5
done
[ -n "$run" ] || { echo "no build found for $sha" >&2; exit 1; }
gh run watch "$run" --repo "$repo" --exit-status >/dev/null || { echo "build failed: gh run view $run --repo $repo --log-failed" >&2; exit 1; }

echo "deploying"
for i in 1 2 3 4; do
  out="$(timeout 240 ssh -o ConnectTimeout=15 -o ServerAliveInterval=10 -i "$key" "$host" "/srv/lector/deploy.sh $sha" 2>&1 || true)"
  echo "$out" | tail -2
  echo "$out" | grep -q "^deployed sha-$sha" && break
  [ "$i" = 4 ] && { echo "deploy did not finish; check the server before retrying" >&2; exit 1; }
  sleep 10
done

sleep 3
for path in /landing /setup; do
  echo "$path $(curl -s -m 20 -o /dev/null -w '%{http_code}' "$site$path")"
done
