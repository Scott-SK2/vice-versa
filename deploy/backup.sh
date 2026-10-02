#!/usr/bin/env bash
# Sauvegarde de la base : ./deploy/backup.sh [etiquette]
# Écrit deploy/data/backups/vv_<date>_<etiquette>.sql.gz et garde les 30 plus récentes.
set -euo pipefail
cd "$(dirname "$0")/.."
label="${1:-auto}"
mkdir -p deploy/data/backups
file="deploy/data/backups/vv_$(date +%Y%m%d_%H%M%S)_${label}.sql.gz"
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T db \
  pg_dump -U viceversa --no-owner --clean --if-exists viceversa | gzip > "$file"
ls -1t deploy/data/backups/vv_*.sql.gz | tail -n +31 | xargs -r rm -f
echo "✔ $file ($(du -h "$file" | cut -f1))"
