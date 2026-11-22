#!/usr/bin/env bash
set -euo pipefail

# Plinth VPS Database Restore Verification Script
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <backup-file.sql.gz[.enc]>"
  exit 1
fi

BACKUP_FILE="$1"
RESTORE_TMP="/tmp/restore_$$.sql"

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "[ERROR] Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

echo "[INFO] Preparing restore from: ${BACKUP_FILE}..."
if [[ "${BACKUP_FILE}" == *.enc ]]; then
  if [[ -z "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
    echo "[ERROR] BACKUP_ENCRYPTION_KEY env var required to decrypt .enc backup."
    exit 1
  fi
  openssl enc -d -aes-256-cbc -pbkdf2 -in "${BACKUP_FILE}" -pass "env:BACKUP_ENCRYPTION_KEY" | gunzip > "${RESTORE_TMP}"
else
  gunzip -c "${BACKUP_FILE}" > "${RESTORE_TMP}"
fi

echo "[INFO] Restoring database into Postgres container..."
docker compose -f docker-compose.prod.yml exec -T postgres psql -U plinth_user -d plinth_prod < "${RESTORE_TMP}"

rm -f "${RESTORE_TMP}"
echo "[INFO] Database restored and temporary files removed successfully."
