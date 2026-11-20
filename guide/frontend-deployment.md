# Deploy the Senja Tas frontend to the existing EC2 stack

The frontend adds `/dashboard/` and `/chat/` to the current DuckDNS domain. n8n remains at `/`; its editor, production Telegram callback, database, and workflows remain in place.

## Prerequisites

- The working server stack is in `/opt/capstone` and already includes Caddy with one `basic_auth` block for owner endpoints.
- The six latest workflows are active with the unprefixed paths `chat`, `pesanan`, `tanpa-jawaban`, `skor`, `eval`, `ingest`, and optional `realtime-token`.
- Keep realtime-token owner-authenticated and MCP blocked. See voice-demo.md for the voice-specific deployment and rollback. The new template protects both current and legacy administrative webhook names.
- The template is based on the inspected EC2 Caddy configuration. If you add other custom proxy rules later, merge those into `deploy/Caddyfile.frontend` before another deployment.

## Build and upload from this PC

From `frontend/`:

```powershell
npm ci
npm test
npm run build
```

From the repository directory:

```powershell
ssh -i key-n8n-ec2.pem ubuntu@capstone-richard-khonan.duckdns.org 'mkdir -p /opt/capstone/frontend /opt/capstone/deploy'
scp -i key-n8n-ec2.pem -r frontend/dist ubuntu@capstone-richard-khonan.duckdns.org:/opt/capstone/frontend/
scp -i key-n8n-ec2.pem deploy/Caddyfile.frontend deploy/deploy_frontend.py ubuntu@capstone-richard-khonan.duckdns.org:/opt/capstone/deploy/
scp -i key-n8n-ec2.pem compose.frontend.yaml ubuntu@capstone-richard-khonan.duckdns.org:/opt/capstone/
```

Do not upload `.env`, keys, database backups, or `node_modules` with the build.

## Activate on EC2

```bash
cd /opt/capstone
python3 deploy/deploy_frontend.py
```

The helper:

1. Copies the build into a timestamped `frontend-releases` directory.
2. Saves the current Caddyfile, Compose file, and prior release selection under `frontend-backups`.
3. Preserves the existing basic-auth block in memory without printing the password hash.
4. Validates the proposed Caddyfile and combined Compose configuration before changing the active proxy.
5. Switches the `current` symlink and recreates only Caddy with a read-only frontend mount.
6. Restores the previous proxy/release if activation fails.

Expect a brief HTTPS interruption while Caddy restarts. No workflow restart or database migration is involved. Do not rerun the destructive `data/schema.sql`.

Use the combined Compose configuration for future proxy operations so the frontend mount is retained:

```bash
docker compose -f compose.yaml -f compose.frontend.yaml ps
docker compose -f compose.yaml -f compose.frontend.yaml logs --tail=50 caddy
```

## Verify

- `/chat/` is public and loads its styles/scripts.
- `/dashboard/` prompts for the existing Caddy owner login (separate from the n8n editor account).
- Unauthenticated requests to `/webhook/pesanan`, `/webhook/tanpa-jawaban`, `/webhook/skor`, `/webhook/eval`, and `/webhook/ingest` return 401.
- `/webhook/realtime-token` returns 401 without owner authentication. Legacy/test realtime-token paths and MCP paths return 403.
- An authenticated dashboard displays the same data as the current n8n dashboard APIs.
- `/` still loads the n8n editor, and its existing service containers remain healthy.
- A normal catalog question and photo search work through public chat; sources are visible.

Basic authentication uses the browser's built-in credential cache. There is no application logout button; use a private browser window for owner access on shared devices.

## Rollback

The deployment command prints the exact backup path. On EC2:

```bash
cd /opt/capstone
python3 deploy/deploy_frontend.py --rollback /opt/capstone/frontend-backups/TIMESTAMP
```

Rollback restores the prior Caddyfile and release selection and recreates only Caddy. It does not roll back customer orders, conversations, or evaluations. Release directories are retained for recovery; there is no automatic deletion.
