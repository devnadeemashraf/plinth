# VPS + Docker + Caddy Production Operator Handbook

This handbook details how to configure, secure, deploy, and maintain a `plinth` backend on an unmanaged Linux VPS (e.g., Hetzner Cloud, DigitalOcean Droplet, AWS Lightsail, Linode) using Docker Compose and Caddy.

---

## 1. Host Server Hardening Checklist

### 1.1 OS & User Setup
1. Deploy Ubuntu 24.04 LTS x86_64 or aarch64.
2. Create dedicated non-root deployer user:
   ```bash
   adduser deployer
   usermod -aG sudo,docker deployer
   ```
3. Disable SSH password authentication and root login in `/etc/ssh/sshd_config`:
   ```text
   PermitRootLogin no
   PasswordAuthentication no
   ```
4. Restart SSH service: `sudo systemctl restart ssh`.

### 1.2 Firewall (UFW)
Configure UFW with least privilege:
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 80/tcp comment 'HTTP ACME challenge'
sudo ufw allow 443/tcp comment 'HTTPS TLS'
sudo ufw allow 443/udp comment 'HTTP/3 QUIC'
sudo ufw enable
```

---

## 2. Docker Compose & Reverse Proxy Configuration

### 2.1 Caddy Reverse Proxy
Caddy automatically provisions Let's Encrypt certificates, handles renewal, and enables modern HTTP/2 and HTTP/3 QUIC protocols.
- Placed in `deploy/Caddyfile`.
- Proxies traffic to internal `app:3000` service on Docker internal network.
- Adds HSTS (`max-age=63072000`), nosniff, DENY frame options, and removes `Server` identifier headers.

### 2.2 Security Isolations
- PostgreSQL and Redis containers do **not** bind any host ports. They are reachable solely via Docker internal network `plinth-net`.
- Application runs as unprivileged user `node` inside container (UID 1000).

---

## 3. Automated Backup & Disaster Recovery (RPO & RTO)

### 3.1 Recovery Objectives
- **RPO (Recovery Point Objective)**: <= 24 hours (daily snapshot) or <= 1 hour (with WAL archiving).
- **RTO (Recovery Time Objective)**: <= 15 minutes to full service restoration.

### 3.2 Backup Execution Runbook
Backups are executed via `deploy/backup.sh`:
1. Executes `pg_dump` via `docker compose exec`.
2. Compresses output with gzip.
3. Optionally encrypts using OpenSSL AES-256-CBC.
4. Purges backups older than 14 days.

Install cron job:
```bash
sudo crontab -e
# Add:
0 3 * * * /opt/plinth/deploy/backup.sh >> /var/log/plinth-backup.log 2>&1
```

### 3.3 Restore Verification Drill Runbook
To verify backup integrity every quarter:
1. Copy backup archive to staging or recovery instance.
2. Run `deploy/restore.sh <backup-file.sql.gz.enc>`.
3. Verify application health probe:
   ```bash
   curl -f http://127.0.0.1:3000/health/ready
   ```

---

## 4. Upgrades & Rolling Deployment
To deploy a new version with zero downtime:
```bash
cd /opt/plinth
git pull origin main
docker compose -f deploy/docker-compose.prod.yml build app
docker compose -f deploy/docker-compose.prod.yml up -d --no-deps app
```
Caddy automatically keeps existing client connections open while routing new requests to the reloaded container.
