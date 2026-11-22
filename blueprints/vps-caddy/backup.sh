#!/usr/bin/env bash
set -euo pipefail

# Plinth VPS Automated Encrypted Backup Script
BACKUP_DIR="/var/backups/plinth"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/postgres_${TIMESTAMP}.sql.gz"
RETENTION_DAYS=14

mkdir -p "${BACKUP_DIR}"

echo "[INFO] Starting PostgreSQL backup: ${BACKUP_FILE}..."
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U plinth_user plinth_prod | gzip > "${BACKUP_FILE}"

echo "[INFO] Encrypting backup with OpenSSL AES-256-CBC..."
if [[ -n "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
  openssl enc -aes-256-cbc -salt -pbkdf2 -in "${BACKUP_FILE}" -out "${BACKUP_FILE}.enc" -pass "env:BACKUP_ENCRYPTION_KEY"
  rm -f "${BACKUP_FILE}"
  echo "[INFO] Encrypted backup created: ${BACKUP_FILE}.enc"
fi

echo "[INFO] Cleaning up backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -type f -name "postgres_*.sql.gz*" -mtime +"${RETENTION_DAYS}" -delete

echo "[INFO] Backup completed successfully."
