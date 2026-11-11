# Readfox deployment (no secrets)

Files that live in `/srv/lector` on the server. Secrets are NOT stored here:

- `.env` (app secrets, written on the server) and `.env.backup` (R2 keys) are created by
  `set-secrets.sh` / by hand and are backed up, age-encrypted, by `backup.sh`.
- `age-recipient.txt` holds only the PUBLIC age key; the private key stays offline.

`Caddyfile` here holds only the `readfox.app` site. The server copy also has a
global options block and site blocks for the operator's other services; keep
those when you copy this file to the server. `deploy.sh` does not copy either file.

Caddy writes access logs to `/srv/lector/logs/readfox.json` (rolled at 20 MiB,
kept 30 days). Client IPs are cut to /24 (IPv4) or /48 (IPv6). Cookie and
Authorization headers and `token` query values are dropped.

Update: run `./deploy.sh <commit-sha>` in `/srv/lector`. The script sets
`LECTOR_VERSION`, pulls the image, and restarts Lector. It then removes old
Lector images. It keeps the new image and the previous image for rollback.

## LLM connection warm-up and latency probe

Bun's `fetch` keeps connections open, so the model API needs no extra keep-alive
setting. A test checks reuse on a plain-HTTP local server, not TLS
(`api/src/lib/llm/openai-compatible.test.ts`). An idle connection still closes
after a while, and the next call pays a new TLS handshake.

- `LLM_PREWARM=1` in `/srv/lector/.env` makes the API send `GET $OPENAI_COMPAT_URL/v1/models`
  at start and every 4 minutes. The request has no prompt and costs no tokens. Default: off.
- To compare the two DashScope endpoints, run this on the server. It sends 5 tiny
  chat requests to each endpoint and prints p50 and p95. It does not print the key.

      docker compose exec lector bun run src/scripts/llm-latency-probe.ts 5

  To switch endpoint, set `OPENAI_COMPAT_URL` in `.env` (no `/v1` suffix) and restart.

## Warm the English to Chinese cache

The step-by-step runbook is [warm-cache-en-zh.md](warm-cache-en-zh.md). It calls the paid model, so get the owner's approval first.

## Lesson prefetch

When a learner opens a lesson, the reader asks `POST /api/translate/prefetch` for the meanings of up to 12 words above the learner's level. It reads the shared cache first. It starts at most 4 new AI translations per lesson and 40 per user per day. It never uses the monthly allowance or the learner's own key. Set `LOOKUP_PREFETCH=0` in `/srv/lector/.env` to turn it off.
