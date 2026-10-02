#!/usr/bin/env bash
# Restauration : ./deploy/restore.sh deploy/data/backups/vv_....sql.gz
# Arrête l'application, remplace la base, redémarre. À n'utiliser qu'en connaissance de cause.
set -euo pipefail
cd "$(dirname "$0")/.."
file="${1:?chemin du fichier .sql.gz}"
compose=(docker compose -f docker-compose.prod.yml --env-file .env.production)
read -r -p "Remplacer la base par $file ? (oui/non) " answer
[[ "$answer" == "oui" ]] || exit 1
"${compose[@]}" stop app
gunzip -c "$file" | "${compose[@]}" exec -T db psql -U viceversa -v ON_ERROR_STOP=1 viceversa
"${compose[@]}" start app
echo "✔ Base restaurée depuis $file"
