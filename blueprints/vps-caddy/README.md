# VPS + Docker + Caddy Production Deployment Blueprint

This blueprint sets up a production-hardened Linux VPS (Ubuntu 24.04 LTS / Debian 12) running Docker Compose and Caddy with automatic Let's Encrypt TLS and HTTP/3 QUIC support.

## Architecture
- **Reverse Proxy**: Caddy 2.9 (Auto-TLS, HTTP/3, HSTS, secure headers)
- **Application**: Plinth (Node 24 Alpine, non-root user, graceful drain)
- **Database**: PostgreSQL 17 (Healthchecked, isolated internal network, named volume)
- **Cache / Queues**: Redis 7 (AOF enabled, LRU eviction policy)

## Setup Instructions

1. **Provision VPS**:
   - Ubuntu 24.04 LTS server (Hetzner, DigitalOcean, Linode, OVH, etc.).
   - Configure UFW firewall:
     ```bash
     sudo ufw default deny incoming
     sudo ufw default allow outgoing
     sudo ufw allow ssh
     sudo ufw allow 80/tcp
     sudo ufw allow 443/tcp
     sudo ufw allow 443/udp
     sudo ufw enable
     ```

2. **Configure Environment**:
   - Copy `deploy/Caddyfile` and customize `api.example.com` and your admin email.
   - Generate strong encryption keys:
     ```bash
     export MASTER_ENCRYPTION_KEY=$(openssl rand -hex 32)
     export JWT_SECRET=$(openssl rand -hex 32)
     ```

3. **Start Services**:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```

4. **Verify Health**:
   ```bash
   curl -I https://api.example.com/health/live
   curl -I https://api.example.com/health/ready
   ```

5. **Automate Backups**:
   - Install cron job:
     ```bash
     0 2 * * * /opt/plinth/deploy/backup.sh >> /var/log/plinth-backup.log 2>&1
     ```
