#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
docker compose exec -T postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose exec -T redis redis-cli ping
for service in api runtime; do
  port=4000; [[ $service == runtime ]] && port=4001
  healthy=false
  for attempt in {1..30}; do
    if docker compose exec -T "$service" node -e "fetch('http://127.0.0.1:$port/healthz').then(r=>{if(!r.ok)process.exit(1);console.log('$service healthy')}).catch(()=>process.exit(1))"; then
      healthy=true; break
    fi
    sleep 1
  done
  [[ $healthy == true ]] || { echo "$service failed readiness checks"; exit 1; }
done
