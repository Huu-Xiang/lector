# Readfox deployment (no secrets)

Files that live in `/srv/lector` on the server. Secrets are NOT stored here:

- `.env` (app secrets, written on the server) and `.env.backup` (R2 keys) are created by
  `set-secrets.sh` / by hand and are backed up, age-encrypted, by `backup.sh`.
- `age-recipient.txt` holds only the PUBLIC age key; the private key stays offline.

Update: edit `LECTOR_VERSION` in `.env` to the new `sha-<commit>` tag, then
`docker compose pull lector && docker compose up -d lector`.
