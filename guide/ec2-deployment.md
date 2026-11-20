# Deploy the n8n stack to Amazon EC2

This is a manual walkthrough: you run the commands and make the AWS changes. It migrates existing workflows, credentials, and PostgreSQL data from Docker Desktop to **https://capstone-richard-khonan.duckdns.org**. It does not create a separate customer-facing chat website.

**Local PowerShell** means your PC, in this project's directory. **EC2 Bash** means an SSH session on the Ubuntu server. Replace uppercase placeholders before running commands. Stop after any failed command; do not continue a partial restore.

## 1. Create EC2 and configure DNS

Launch Ubuntu Server **24.04 LTS, x86_64**, in **Singapore (ap-southeast-1)** with a **t3.medium** and **30 GB encrypted gp3** disk. This is a starting size for a demo, not a free-tier assumption. Download an SSH `.pem` key and keep it private.

Use a public subnet whose route table has an internet-gateway route. Allocate an Elastic IP and associate it with the instance. EC2, EBS, and public IPv4 incur charges; see [AWS IPv4 documentation](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-instance-addressing.html).

Configure the instance security group:

| Inbound port | Source | Purpose |
| --- | --- | --- |
| TCP 22 | Your public IP `/32` | SSH |
| TCP 80 | `0.0.0.0/0` | Certificate validation and redirects |
| TCP 443 | Your public IP `/32` initially | Private setup; open publicly in step 8 |

Leave 5432, 5678, and 5679 closed. Port 80 remains public for ACME HTTP validation while you restrict HTTPS during setup. This walkthrough uses IPv4 only.

In the DuckDNS dashboard, set `capstone-richard-khonan` to the Elastic IP and clear any obsolete IPv6 record. An Elastic IP avoids needing a periodic DuckDNS updater. See the [DuckDNS specification](https://www.duckdns.org/spec.jsp).

**Local PowerShell:**

```powershell
Resolve-DnsName capstone-richard-khonan.duckdns.org -Type A
ssh -i "C:\path\your-key.pem" ubuntu@YOUR_ELASTIC_IP
```

Verify the returned IPv4 address matches EC2 before proceeding. If SSH times out, check the security group, your current public IP, and the subnet route.

## 2. Install Docker and create the server directory

On the new server, install Docker Engine and the Compose plugin using the **apt repository** section of [Docker's Ubuntu installation guide](https://docs.docker.com/engine/install/ubuntu/). Install `docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-buildx-plugin`, and `docker-compose-plugin`.

**EC2 Bash:**

```bash
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu
sudo mkdir -p /opt/capstone
sudo chown ubuntu:ubuntu /opt/capstone
chmod 700 /opt/capstone
exit
```

Reconnect with SSH so the group membership takes effect:

```bash
docker version
docker compose version
cd /opt/capstone
```

## 3. Identify the source and prepare the migration

Start Docker Desktop. The local `.env` previously failed parsing because it contained PowerShell statements. If this is still the case, edit it to contain only environment assignments and comments, preserving existing secrets. Do not paste shell scripts into `.env`.

Keep the original `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `N8N_ENCRYPTION_KEY`, and `N8N_RUNNERS_AUTH_TOKEN`. The original encryption key is required to decrypt saved n8n credentials. Never replace it during migration.

**Local PowerShell:**

```powershell
docker compose config --quiet
docker compose ps -a
docker compose images
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\l"'
```

Confirm these are the actual source containers and volumes. If Compose shows no containers while your n8n is running, find its original Compose project before continuing; otherwise you could back up an empty volume.

Record the actual running image versions. Use those on EC2, including the same PostgreSQL major version and pgvector extension version. n8n and its runners must use matching versions. Do not combine migration with an upgrade or assume the repository's default image tag is the running version.

Check saved PostgreSQL credentials in the n8n editor. The backup below covers only `POSTGRES_DB`. If retail/vector/chat-memory tables are in another database, migrate that database separately, or retain its external connection if it is staying hosted elsewhere. Record any separate database users and grants; `pg_dump` does not export cluster roles.

Record which workflows are active/published, then deactivate/unpublish them in the local editor and allow running executions to finish. A restored active workflow can start schedules or register Telegram callbacks as soon as n8n starts; disabling them before backup makes the cutover deliberate.

Check whether any workflows use files outside `/home/node/.n8n`. Back up those paths too and reproduce their mounts on EC2. Merely copying `data/` does not mount it inside the container.

## 4. Take the final backup

Keep backup material out of Git. In this repository's `.gitignore`, add `/backup/` before creating backups. If this directory already contains an older backup, move that backup to secure storage first; the commands below use fixed filenames.

**Local PowerShell:**

```powershell
New-Item -ItemType Directory -Force backup
docker compose stop n8n task-runners
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/capstone.dump'
docker compose cp postgres:/tmp/capstone.dump ./backup/capstone.dump
docker compose run --rm --no-deps --user 0 --entrypoint sh -v "${PWD}/backup:/backup" n8n -c 'tar czf /backup/n8n-data.tgz -C /home/node/.n8n .'
Copy-Item .env backup/source.env
Get-FileHash backup/capstone.dump, backup/n8n-data.tgz -Algorithm SHA256
```

Keep the hashes for comparison after transfer. The archive command starts only a temporary shell, not n8n. PostgreSQL stays running for the logical dump. Keep local n8n and runners stopped during cutover.

For each additional local application database identified in step 3, repeat the dump and copy with its actual database name and a distinct filename. Restore it into a separately created database on EC2 before starting n8n. If it uses a different role, recreate that role and grants securely and reconnect its n8n credential. Do not restore everything into the n8n database by default.

## 5. Transfer files

**Local PowerShell:**

```powershell
scp -i "C:\path\your-key.pem" compose.yaml Caddyfile .env ubuntu@YOUR_ELASTIC_IP:/opt/capstone/
scp -i "C:\path\your-key.pem" -r backup ubuntu@YOUR_ELASTIC_IP:/opt/capstone/
```

Transfer extra workflow files identified in step 3 as well. JSON workflow exports are not required for the restore: saved workflows and credentials are in the database.

**EC2 Bash:**

```bash
cd /opt/capstone
chmod 600 .env
chmod -R go-rwx backup
sha256sum backup/capstone.dump backup/n8n-data.tgz
```

Compare the hashes with your PC. Keep `backup/source.env` unchanged as the source recovery copy.

## 6. Configure EC2 Compose and HTTPS

Edit the **server's** `.env` using `nano .env`. Preserve the source database values and secrets, set `N8N_VERSION` to the recorded source version, and set:

```dotenv
DOMAIN_NAME=capstone-richard-khonan.duckdns.org
SSL_EMAIL=YOUR_EMAIL_ADDRESS
N8N_HOST=capstone-richard-khonan.duckdns.org
N8N_PORT=5678
N8N_PROTOCOL=https
N8N_EDITOR_BASE_URL=https://capstone-richard-khonan.duckdns.org/
WEBHOOK_URL=https://capstone-richard-khonan.duckdns.org/
N8N_SECURE_COOKIE=true
N8N_PROXY_HOPS=1
```

Edit the server's `compose.yaml`. Remove the `postgres` service's `ports` block publishing `5432:5432`. Keep n8n's localhost binding `127.0.0.1:${N8N_PORT:-5678}:5678`.

Add Caddy under `services`, aligned with `n8n`:

```yaml
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    environment:
      DOMAIN_NAME: ${DOMAIN_NAME}
      SSL_EMAIL: ${SSL_EMAIL}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      n8n:
        condition: service_healthy
```

Add to the existing top-level `volumes` mapping, keeping its existing entries:

```yaml
  caddy_data:
  caddy_config:
```

Caddy shares the default Compose network and proxies to `n8n:5678`. Its persistent volumes keep certificate state. See [automatic HTTPS](https://caddyserver.com/docs/automatic-https).

**EC2 Bash:**

```bash
docker compose config --quiet
docker compose pull
```

If a source version is unavailable, resolve that before starting the destination; do not silently substitute `latest`.

## 7. Restore before starting n8n

**EC2 Bash:**

```bash
docker compose up -d postgres
docker compose ps
```

Wait for PostgreSQL to be healthy. These restore commands assume a fresh destination database and the same database/user names as the source:

```bash
docker compose cp backup/capstone.dump postgres:/tmp/capstone.dump
docker compose exec -T postgres sh -c 'pg_restore --list /tmp/capstone.dump' > backup/restore-contents.txt
docker compose exec -T postgres sh -c 'pg_restore --exit-on-error --single-transaction --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB" /tmp/capstone.dump'
docker compose run --rm --no-deps --user 0 \
  --entrypoint sh \
  -v "$PWD/backup:/backup:ro" \
  n8n \
  -c 'tar xzf /backup/n8n-data.tgz -C /home/node/.n8n && chown -R node:node /home/node/.n8n'
```

`--no-owner --no-acl` assigns restored objects to the restoring user and skips original grants; this suits the stack's single-user database. If you identified separate roles, restore their required grants explicitly. Stop on restore errors. Do not repeat a successful restore over a populated database.

**Do not run `data/schema.sql`: it drops `retail`. Do not reseed or reimport duplicate workflows.** Restore additional databases/files now if needed.

Start n8n and runners, still with workflows deactivated:

```bash
docker compose up -d n8n task-runners
docker compose ps
docker compose logs --tail=100 n8n task-runners
```

## 8. Protect endpoints and open the demo

The n8n editor login does not protect webhook nodes configured with authentication `none`. Before starting public access, replace the server's Caddyfile with the configuration below. It leaves production chat and Telegram callbacks reachable, protects the known administrative webhooks and all test webhooks, and blocks realtime-token issuance and MCP externally.

Generate a proxy password hash interactively on **EC2**:

```bash
docker compose run --rm --no-deps caddy caddy hash-password
```

Enter a new administrator password when prompted. Paste the resulting bcrypt hash in place of `PASTE_BCRYPT_HASH_HERE` below. This is separate from your n8n login; the password itself is not stored in the Caddyfile. See [Caddy basic authentication](https://caddyserver.com/docs/caddyfile/directives/basic_auth).

```caddyfile
{
    email {$SSL_EMAIL}
}

{$DOMAIN_NAME} {
    @blocked path /mcp /mcp/* /mcp-test /mcp-test/* /mcp-server /mcp-server/* /webhook/ide05-realtime-token /webhook/ide05-realtime-token/* /webhook-test/ide05-realtime-token /webhook-test/ide05-realtime-token/*
    handle @blocked {
        respond "Endpoint not public" 403
    }

    @admin path /webhook/ide05-ingest /webhook/ide05-ingest/* /webhook/ide05-eval /webhook/ide05-eval/* /webhook/ide05-pesanan /webhook/ide05-pesanan/* /webhook/ide05-tanpa-jawaban /webhook/ide05-tanpa-jawaban/* /webhook/ide05-skor /webhook/ide05-skor/* /webhook-test /webhook-test/*
    handle @admin {
        basic_auth {
            admin PASTE_BCRYPT_HASH_HERE
        }
        reverse_proxy n8n:5678 {
            flush_interval -1
        }
    }

    handle {
        reverse_proxy n8n:5678 {
            flush_interval -1
        }
    }
}
```

Validate before starting Caddy:

```bash
docker compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose up -d caddy
docker compose logs --tail=100 caddy
```

Open **https://capstone-richard-khonan.duckdns.org** from your allowed IP and log in with the existing n8n account. If certificate issuance fails, check DNS A/AAAA records, port 80, the Caddy logs, and whether another process occupies ports 80/443.

Check PostgreSQL credentials in the editor: use `postgres:5432` for this stack's database. Replace PC-specific addresses such as `host.docker.internal` when that database has moved. Keep external database addresses unchanged. The internal HTTP calls to `http://localhost:5678/webhook/ide05-chat` can remain when executed by n8n itself.

Reactivate only the workflows recorded in step 3 that are needed for the demo. Keep realtime-token inactive until its own access controls are designed. Activate Telegram only on EC2 and verify its production callback; avoid test-listening locally with the same bot token.

Test access controls before opening HTTPS publicly:

```bash
curl -I https://capstone-richard-khonan.duckdns.org/
curl -i -X POST https://capstone-richard-khonan.duckdns.org/webhook/ide05-ingest
curl -i https://capstone-richard-khonan.duckdns.org/webhook/ide05-pesanan
curl -i -X POST https://capstone-richard-khonan.duckdns.org/webhook/ide05-realtime-token
curl -i https://capstone-richard-khonan.duckdns.org/mcp/example
```

Run these from your allowed PC using `curl.exe` instead of `curl`, or from EC2 after temporarily allowing its public IP on 443. Expect **401** for the unauthenticated administrative routes and **403** for blocked routes. An authenticated dashboard check can use `curl.exe -u admin URL`, which prompts for the password. Do not put the password directly in command history.

Change the security group's TCP 443 source to `0.0.0.0/0` when verification passes. Production chat is now public. This walkthrough does not implement chat rate limiting: public chat can consume your API quota. Monitor provider usage during the demo and deactivate chat when the demo ends. Review proxy matchers whenever webhook paths change or new workflows are published.

## 9. Verify recovery, backups, and rollback

Verify existing workflow counts, credential decryption, retail data and orders, catalog retrieval, and Telegram if used. Run a JavaScript Code node with `return [{ json: { ok: true } }];` and a Python Code node in Run Once for All Items mode with `return [{"json": {"ok": True}}]`.

From **local PowerShell**, check that direct service ports are closed:

```powershell
Test-NetConnection YOUR_ELASTIC_IP -Port 5432
Test-NetConnection YOUR_ELASTIC_IP -Port 5678
Test-NetConnection YOUR_ELASTIC_IP -Port 5679
```

Each should report `TcpTestSucceeded: False`. Check HTTPS and a real chat request using the workflow's expected payload. This repository contains the n8n endpoints, not a separate browser chat frontend.

On **EC2**, reboot once:

```bash
sudo reboot
```

Reconnect, then check:

```bash
cd /opt/capstone
docker compose ps
docker compose logs --tail=100 n8n task-runners caddy
```

Verify HTTPS and chat again. All services should recover automatically. Keep this Compose directory stable so its default project name and named volumes remain consistent.

For subsequent backups, schedule a quiet period, let executions finish, stop n8n and runners, and repeat the database dump and n8n-volume archive from step 4 using a new dated backup directory. In Bash use `$PWD` for the bind mount and `cp .env BACKUP_DIRECTORY/source.env` instead of PowerShell `Copy-Item`. Restart with `docker compose up -d n8n task-runners`. Copy backups and the encryption key to encrypted storage off EC2, retain at least seven daily copies, and test a restore into an isolated stack with workflows disabled. A backup only on the instance is not sufficient recovery protection.

For rollback, stop EC2's n8n and runners first. Start the original local services with `docker compose up -d n8n task-runners`, then reactivate the recorded workflows and restore the active Telegram registration. The local data is the cutover snapshot: reconcile any new EC2 orders before rollback if needed. The DuckDNS domain still points to EC2; returning to the local instance does not automatically preserve public domain availability.

Keep the source volumes and final migration backups until acceptance. Never use `docker compose down -v` unless you intend to delete stored data. Do not rerun the destructive schema seed as a recovery step.
