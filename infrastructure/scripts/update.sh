#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
[[ -f .env ]] || { echo 'Run installation first'; exit 1; }
bash infrastructure/scripts/backup.sh
docker compose build
docker compose up -d postgres redis
docker compose run --rm migrate
# Existing runtime stays online while administration and workers update.
docker compose up -d --no-deps api worker dashboard
echo 'Updated administration. Runtime update is a separate restart: docker compose up -d --no-deps runtime'
bash infrastructure/scripts/health.sh
