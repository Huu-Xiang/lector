#!/usr/bin/env bash
# Deploy a Lector image and remove old Lector images.
# Usage: ./deploy.sh <commit-sha>   (full 40-character sha, or a tag like sha-<commit>)
# Keeps two images: the new one and the one that ran before (for rollback).
set -euo pipefail
cd /srv/lector

NEW="${1:?usage: ./deploy.sh <commit-sha>}"
[[ "$NEW" == sha-* ]] || NEW="sha-$NEW"
if ! [[ "$NEW" =~ ^sha-[0-9a-f]{40}$ ]]; then
  echo "error: give the full 40-character commit sha (git rev-parse <commit>)" >&2
  exit 1
fi
OLD="$(grep '^LECTOR_VERSION=' .env | cut -d= -f2)"
REPO="ghcr.io/huu-xiang/lector"

# Pull first, so a missing image never leaves a bad version in .env.
docker pull "$REPO:$NEW"
if [ "$NEW" != "$OLD" ]; then
  sed -i "s|^LECTOR_VERSION=.*|LECTOR_VERSION=$NEW|" .env
fi
docker compose up -d lector

# Remove every Lector image except the new one and the previous one.
docker images --format '{{.Tag}}' "$REPO" | while read -r tag; do
  case "$tag" in
    "$NEW"|"$OLD") ;;
    sha-*) docker rmi "$REPO:$tag" || true ;;
  esac
done

echo "deployed $NEW (previous: $OLD)"
df -h / | tail -1
