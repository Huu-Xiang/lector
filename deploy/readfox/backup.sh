#!/usr/bin/env bash
# Daily encrypted snapshot of the DB and .env to R2. Needs only the PUBLIC age key.
set -euo pipefail
cd /srv/lector
set -a; . ./.env.backup; set +a
export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare \
  RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
  RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  RCLONE_CONFIG_R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com" \
  RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
D=$(date -u +%F-%H%M)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
sqlite3 data/lector.db ".backup '$T/lector.db'"
test "$(sqlite3 "$T/lector.db" 'PRAGMA integrity_check;')" = ok
gzip -c "$T/lector.db" | age -R age-recipient.txt -o "$T/lector-$D.db.gz.age"
age -R age-recipient.txt -o "$T/env-$D.age" .env
rclone copyto "$T/lector-$D.db.gz.age" "R2:$R2_BUCKET/daily/lector-$D.db.gz.age"
rclone copyto "$T/env-$D.age" "R2:$R2_BUCKET/secrets/env-$D.age"
# keep 30 days
rclone delete "R2:$R2_BUCKET/daily" --min-age 30d
rclone delete "R2:$R2_BUCKET/secrets" --min-age 30d
echo "backup ok $D"
