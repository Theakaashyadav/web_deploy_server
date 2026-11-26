#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
if [[ ${1:-} != --approve-server-changes ]]; then
  echo 'Review this script, then run: bash infrastructure/scripts/install.sh --approve-server-changes'
  echo 'This installs Docker if missing, generates configuration, and starts services. Firewall is left for your explicit configuration.'
  exit 1
fi
private_source_builds=false
for option in "$@"; do
  case "$option" in
    --approve-server-changes) ;;
    --enable-private-source-builds) private_source_builds=true ;;
    *) echo "Unknown installation option: $option"; exit 1 ;;
  esac
done
if [[ -f .env ]] && ! grep -Eq '^NODE_ENV=production[[:space:]]*$' .env; then
  echo 'An existing development .env was found. Keep a copy, then move it out of this checkout before production installation.'
  echo 'The installer preserves existing configuration and will generate a fresh production .env only when none exists.'
  exit 1
fi
run_root() { if [[ $EUID == 0 ]]; then "$@"; else sudo "$@"; fi; }
if ! command -v openssl >/dev/null || ! command -v python3 >/dev/null || ! command -v curl >/dev/null; then
  command -v apt-get >/dev/null || { echo 'Install openssl, python3 and curl before using this installer.'; exit 1; }
  run_root apt-get update
  run_root apt-get install -y ca-certificates curl openssl python3
fi
if ! command -v docker >/dev/null; then
  command -v curl >/dev/null || { echo 'Install curl first.'; exit 1; }
  curl -fsSL https://get.docker.com -o /tmp/deployhub-install-docker.sh
  run_root sh /tmp/deployhub-install-docker.sh
  rm -f /tmp/deployhub-install-docker.sh
fi
docker compose version >/dev/null
docker info >/dev/null 2>&1 || { echo 'Docker daemon access is unavailable. Start Docker and rerun this script with sudo or a Docker-authorized account.'; exit 1; }
if [[ ! -f .env ]]; then
  read -rp 'Administrator domain (e.g. admin.example.com): ' admin_domain
  read -rp 'Separate hosting domain (e.g. sites.example.net): ' site_domain
  read -rp 'ACME certificate email: ' acme_email
  [[ $admin_domain =~ ^[a-zA-Z0-9.-]+$ && $site_domain =~ ^[a-zA-Z0-9.-]+$ && $acme_email =~ ^[^[:space:]]+@[^[:space:]]+$ ]] || { echo 'Invalid domain/email'; exit 1; }
  umask 077
  data_path="$(pwd -P)/data"
  build_network=none
  runtime_internal=true
  if [[ $private_source_builds == true ]]; then
    build_network=bridge
    runtime_internal=false
    echo 'Approved private source builds: build/runtime containers can reach the network for dependencies and application services.'
  fi
  [[ $data_path != *'$'* && $data_path != *' '* ]] || { echo 'Use a checkout path without spaces or dollar signs.'; exit 1; }
  cat > .env <<EOF
NODE_ENV=production
ADMIN_DOMAIN=$admin_domain
DASHBOARD_ORIGIN=https://$admin_domain
SITE_DOMAIN=$site_domain
SITE_PROTOCOL=https
SITE_PORT=443
ACME_EMAIL=$acme_email
POSTGRES_USER=deployhub
POSTGRES_DB=deployhub
POSTGRES_PASSWORD=$(openssl rand -hex 32)
DATA_PATH=$data_path
ENCRYPTION_KEY=$(openssl rand -hex 32)
SETUP_TOKEN=$(openssl rand -hex 32)
BUILD_DOCKER_ENABLED=true
RUNTIME_DOCKER_ENABLED=true
RUNTIME_DOCKER_GATEWAY=network
RUNTIME_DOCKER_NETWORK=deployhub-runtime
RUNTIME_NETWORK_INTERNAL=$runtime_internal
RUNTIME_BUILD_IMAGE=node:22-bookworm
BUILD_MEMORY_MB=2048
RUNTIME_MEMORY_MB=1024
MAX_RUNTIME_ARTIFACT_BYTES=4294967296
BUILD_HOST_DATA_DIR=$data_path
BUILD_IMAGE=node:22-alpine
BUILD_NETWORK=$build_network
BUILD_TIMEOUT_MS=600000
DOCKER_GID=$(stat -c '%g' /var/run/docker.sock)
EOF
  echo 'Generated private .env. Read SETUP_TOKEN locally for first-admin setup.'
fi
docker compose config --format json | python3 -c '
import json,re,sys
configuration=json.load(sys.stdin)
environment=configuration["services"]["api"]["environment"]
if not re.fullmatch(r"[0-9a-fA-F]{64}",environment.get("ENCRYPTION_KEY","")):
    raise SystemExit("Production ENCRYPTION_KEY must contain 64 hexadecimal characters")
if len(environment.get("SETUP_TOKEN", "")) < 32:
    raise SystemExit("Configure a random SETUP_TOKEN of at least 32 characters before first-admin setup")
if environment.get("SITE_DOMAIN") in (None,"","localhost") or not environment.get("DASHBOARD_ORIGIN", "").startswith("https://"):
    raise SystemExit("Production hosting requires public SITE_DOMAIN and HTTPS DASHBOARD_ORIGIN")
'
data_path=$(docker compose config --format json | python3 -c 'import json,sys;print(next(v["source"] for v in json.load(sys.stdin)["services"]["api"]["volumes"] if v["target"]=="/data"))')
[[ $data_path == /* && $data_path != / ]] || { echo 'DATA_PATH must resolve to a dedicated absolute data directory.'; exit 1; }
mkdir -p "$data_path" backups
run_root chown -R 1000:1000 "$data_path"
chmod 700 backups
docker pull node:22-alpine
if [[ $private_source_builds == true ]]; then docker pull node:22-bookworm; fi
docker compose build
docker compose up -d
echo 'Services started. Point administrator DNS and wildcard hosting DNS at this server.'
echo 'Allow inbound TCP80, TCP443 and optionally UDP443. Preserve SSH before changing any firewall rules.'
bash infrastructure/scripts/health.sh
