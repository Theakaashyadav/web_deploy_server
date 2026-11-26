#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
umask 077
mkdir -p backups
backup_dir="$(pwd -P)/backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir "$backup_dir"
previously_running=$(docker compose ps --status running --services | grep -E '^(api|worker)$' || true)
restart_services() {
  if [[ -n $previously_running ]]; then
    while IFS= read -r service; do docker compose start "$service" >/dev/null; done <<< "$previously_running"
  fi
}
trap restart_services EXIT
# Stop writers while capturing metadata + artifacts; serving remains available.
docker compose stop api worker
python3 infrastructure/scripts/runtime-volumes.py backup "$backup_dir/runtime-volumes"
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$backup_dir/database.dump"
data_path=$(docker compose config --format json | python3 -c 'import json,sys;print(next(v["source"] for v in json.load(sys.stdin)["services"]["api"]["volumes"] if v["target"]=="/data"))')
[[ -d $data_path && $data_path != / ]] || { echo 'Unsafe or missing data path'; exit 1; }
data_path=$(realpath -- "$data_path")
[[ $data_path != / && $backup_dir != "$data_path/"* ]] || { echo 'Backup directory must be outside the dedicated data directory.'; exit 1; }
# Keep uploaded source: queued/interrupted deployments need it after restoration.
tar -C "$data_path" --exclude='./workspaces' --exclude='./tmp' -czf "$backup_dir/artifacts.tar.gz" .
cp docker-compose.yml "$backup_dir/"
cp infrastructure/proxy/Caddyfile "$backup_dir/"
# Contains DB and encryption keys. Restrict access and encrypt off-server copies.
cp .env "$backup_dir/environment.env"
docker compose exec -T caddy tar -czf - -C /data . > "$backup_dir/caddy-data.tar.gz"
(cd "$backup_dir" && sha256sum database.dump artifacts.tar.gz docker-compose.yml Caddyfile environment.env caddy-data.tar.gz > SHA256SUMS && find runtime-volumes -type f -print0 | sort -z | xargs -0 -r sha256sum >> SHA256SUMS)
echo "Backup created: $backup_dir"
echo 'Verify with: (cd BACKUP_DIRECTORY && sha256sum -c SHA256SUMS)'
