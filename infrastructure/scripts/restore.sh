#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
[[ $# == 2 && $2 == --confirm-restore ]] || { echo 'Usage: bash infrastructure/scripts/restore.sh BACKUP_DIRECTORY --confirm-restore'; exit 1; }
backup_dir=$(realpath -- "$1")
[[ -d $backup_dir && -f "$backup_dir/SHA256SUMS" ]] || { echo 'Backup missing'; exit 1; }
(cd "$backup_dir" && sha256sum -c SHA256SUMS)
python3 - "$backup_dir/environment.env" .env <<'PY'
import pathlib,sys
def key(filename):
    for line in pathlib.Path(filename).read_text().splitlines():
        if line.startswith('ENCRYPTION_KEY='):
            return line.split('=',1)[1].strip().strip('"').strip("'")
    return ''
if not key(sys.argv[1]) or key(sys.argv[1]) != key(sys.argv[2]):
    raise SystemExit('Restore the backup ENCRYPTION_KEY from environment.env into .env before restoring encrypted project variables. No services have been stopped.')
PY
docker compose stop api worker runtime
docker compose up -d --wait postgres redis
table_count=$(docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema = '\''public'\''"' | tr -d '[:space:]')
[[ $table_count == 0 ]] || { echo 'Restore requires an empty database. Existing data has not been replaced. Use a fresh installation/volume.'; exit 1; }
data_path=$(docker compose config --format json | python3 -c 'import json,sys;print(next(v["source"] for v in json.load(sys.stdin)["services"]["api"]["volumes"] if v["target"]=="/data"))')
[[ -d $data_path && $data_path != / ]] || { echo 'Unsafe data path'; exit 1; }
[[ -z $(find "$data_path" -mindepth 1 -print -quit) ]] || { echo 'Restore requires an empty data directory.'; exit 1; }
python3 - "$backup_dir/artifacts.tar.gz" <<'PY'
import pathlib,sys,tarfile
with tarfile.open(sys.argv[1]) as archive:
    for member in archive:
        path=pathlib.PurePosixPath(member.name)
        if path.is_absolute() or '..' in path.parts or not (member.isfile() or member.isdir()):
            raise SystemExit('Unsafe backup archive member')
PY
tar -xzf "$backup_dir/artifacts.tar.gz" -C "$data_path" --no-same-owner
if [[ $EUID == 0 ]]; then chown -R 1000:1000 "$data_path"; else sudo chown -R 1000:1000 "$data_path"; fi
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --exit-on-error --no-owner --single-transaction' < "$backup_dir/database.dump"
python3 infrastructure/scripts/runtime-volumes.py restore "$backup_dir/runtime-volumes"
docker compose up -d
bash infrastructure/scripts/health.sh
echo 'Restored database, source uploads and artifacts using the matching environment encryption key.'
echo 'Caddy will reacquire certificates; retained certificate archive is available for a separate reviewed restore.'
