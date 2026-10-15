# Readfox deployment (no secrets)

Files that live in `/srv/lector` on the server. Secrets are NOT stored here:

- `.env` (app secrets, written on the server) and `.env.backup` (R2 keys) are created by
  `set-secrets.sh` / by hand and are backed up, age-encrypted, by `backup.sh`.
- `age-recipient.txt` holds only the PUBLIC age key; the private key stays offline.

Update: run `./deploy.sh <commit-sha>` in `/srv/lector`. The script sets
`LECTOR_VERSION`, pulls the image, and restarts Lector. It then removes old
Lector images. It keeps the new image and the previous image for rollback.
