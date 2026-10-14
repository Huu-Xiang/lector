#!/usr/bin/env bash
# Prompts only for secrets that are not saved yet (hidden input where sensitive).
# Each value is saved the moment it is entered. Use --redo KEY to re-enter one.
set -euo pipefail
cd /srv/lector
umask 077
touch .env .env.backup
REDO="${2:-}"; [ "${1:-}" = "--redo" ] || REDO=""
has() { grep -q "^$2=." "$1" 2>/dev/null; }
set_kv() { # file key value
  local f="$1" k="$2" v="$3" tmp
  tmp="$(mktemp)"
  grep -v "^${k}=" "$f" > "$tmp" || true
  printf "%s=%s\n" "$k" "$v" >> "$tmp"
  cat "$tmp" > "$f"; rm -f "$tmp"
}
need() { # file key prompt hidden(1/0)
  local f="$1" k="$2" p="$3" h="$4" v
  if has "$f" "$k" && [ "$REDO" != "$k" ]; then echo "[skip] $k already saved"; return; fi
  if [ "$h" = "1" ]; then read -rsp "$p: " v; echo; else read -rp "$p: " v; fi
  [ -n "$v" ] || { echo "empty value, aborting (nothing lost; run again)"; exit 1; }
  set_kv "$f" "$k" "$v"; echo "[saved] $k"
}
echo "== Resend (email) =="
need .env RESEND_API_KEY "RESEND_API_KEY (starts with re_)" 1
has .env EMAIL_FROM || set_kv .env EMAIL_FROM "Readfox <noreply@readfox.app>"
echo "== AI model provider (Alibaba Bailian) =="
need .env OPENAI_COMPAT_API_KEY "Model API key (sk-...)" 1
echo "== Turnstile =="
need .env TURNSTILE_SITE_KEY "Turnstile Site Key" 0
need .env TURNSTILE_SECRET_KEY "Turnstile Secret Key" 1
echo "== R2 backup =="
need .env.backup R2_ACCOUNT_ID "R2 Account ID" 0
need .env.backup R2_BUCKET "R2 bucket name" 0
need .env.backup R2_ACCESS_KEY_ID "R2 Access Key ID" 0
need .env.backup R2_SECRET_ACCESS_KEY "R2 Secret Access Key" 1
chmod 600 .env .env.backup
echo; echo "Keys present (values hidden):"
sed "s/=.*//" .env | tr "\n" " "; echo; sed "s/=.*//" .env.backup | tr "\n" " "; echo
echo "Done. Tell Claude: secrets saved."
