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
