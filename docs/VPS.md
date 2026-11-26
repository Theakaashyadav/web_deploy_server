# Linux VPS installation and operations

## Prepare DNS and the server

Use a dedicated Ubuntu LTS server with Docker support, at least 2 vCPUs / 4 GiB RAM and enough quota-limited disk for uploads, retained artifacts, database and backups. A static-only private installation can use less memory; builds require additional headroom.

Use separate registrable domains, for example `admin.example.com` and `sites.example.net`. These are illustrative values, not deployed URLs. Configure:

| Record | Target |
| --- | --- |
| `admin.example.com` A | VPS IPv4 address |
| `sites.example.net` A | VPS IPv4 address |
| `*.sites.example.net` A | VPS IPv4 address |
| Optional AAAA counterparts | VPS IPv6 only when reachable |

Allow inbound TCP80 and TCP443, optionally UDP443. Keep SSH access allowed before changing firewall rules. Do not publish PostgreSQL, Redis or Docker ports. The installer deliberately leaves an existing firewall untouched.

The supplied Caddy configuration uses individual on-demand certificates, with its permission endpoint approving only real active project/deployment hostnames and verified domains. It does not provision a wildcard certificate. Wildcard DNS is sufficient; DNS-01 wildcard certificates would require a provider-specific Caddy build and credentials that are outside this implementation. See [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https).

## Install

Copy the repository, including `package-lock.json`, to `/opt/deployhub`. Requirements include curl, OpenSSL and Python3. Choose a path without spaces or dollar signs for Docker bind paths. If you copied a local development `.env`, move it aside securely first; the installer refuses development configuration instead of silently reusing it. Review scripts before running:

```bash
cd /opt/deployhub
sudo bash infrastructure/scripts/install.sh --approve-server-changes
docker compose ps
docker compose logs --tail=100 api worker runtime dashboard caddy
```

The explicit flag authorizes installing Docker if missing, creating new private configuration and starting the stack. Existing `.env` is preserved. The installer generates database and setup credentials, an encryption key and an absolute `DATA_PATH`. Docker group ID is supplied to the trusted worker so its non-root process can access the orchestration socket. Build containers never receive that socket.

For a dedicated private server that will build your own Next.js/Node/framework projects and call their external APIs, review the network boundaries and opt in explicitly:

```bash
sudo bash infrastructure/scripts/install.sh --approve-server-changes --enable-private-source-builds
```

This additional flag allows network access for dependency downloads and application services when generating a new production configuration. It does not rewrite an existing `.env` or migrate an existing Docker network. Public hostile multi-tenant use still requires a separately hardened egress/isolation design. The runtime readiness check remains unavailable when Docker or its required configuration is missing.

Open `/admin` on the configured administrator HTTPS domain. Read `SETUP_TOKEN` from `.env` locally and use it to create the first administrator. Do not share or paste `.env` into logs. Keep `ENCRYPTION_KEY` across upgrades and disaster recovery; changing it makes saved variables unreadable.

Manual equivalent after creating `.env` and giving data ownership to uid1000:

```bash
docker pull node:22-alpine
docker compose build
docker compose up -d
bash infrastructure/scripts/health.sh
```

The migration service generates the PostgreSQL client at image build and applies committed PostgreSQL migrations before API/worker startup. SQLite data is for development and is not automatically converted to PostgreSQL. Start production with an empty PostgreSQL database or implement a reviewed data import.

Default build egress is `none`. Dependencies cannot be downloaded in that mode. Upload prebuilt output, supply a curated image with dependencies, or deliberately configure a controlled build network for trusted projects. See [security boundaries](SECURITY.md) before enabling `BUILD_NETWORK=bridge`.

## Verify installation

Deploy a simple ZIP containing `index.html` to preview, then explicitly promote it. The worker verifies both internal artifact serving and the public HTTPS preview identity in production before activation. Confirm two projects, update one, force a failed update and roll back. Check logs and HTTP responses. The platform should retain old production content during a failed build.

Real ACME/DNS verification, Redis recovery and Docker builds need this installation; they were not available on the Windows development host. Run these acceptance checks before relying on the VPS.

Run the isolated Docker runtime fixture inside the worker, where the private application network and host data path are configured:

```bash
docker compose exec -e RUN_RUNTIME_DOCKER_TESTS=1 worker node --import tsx --test tests/integration/runtime-docker.test.ts
```

It creates and removes its own labelled test resources, verifies production-mode builds and SQLite data after container recreation, and does not deploy a user project. Verify your uploaded application separately after configuring its required services and environment values.

## Custom domains

Add the domain in the dashboard and copy the generated TXT ownership record. For subdomains, add a CNAME to the configured hosting domain. For apex names use an A/AAAA record for the VPS or your DNS provider's ALIAS/flattening. Ownership verification checks the exact TXT token; routing is refused until it succeeds. DNS routing must also reach this server for Caddy HTTP challenges. Certificate expiry telemetry is not implemented; inspect Caddy logs and monitor externally.

## Updates

Install reviewed source changes, then run:

```bash
bash infrastructure/scripts/update.sh
```

The script backs up first, builds images and applies migrations before replacing API, worker and dashboard. The runtime stays on its prior image until a separately scheduled restart:

```bash
docker compose up -d --no-deps runtime
```

Incompatible database changes can still affect a running runtime; use backwards-compatible migrations. The single runtime process has no zero-downtime replacement guarantee. Existing sites remain available when only administration processes restart.

## Backups and recovery

```bash
bash infrastructure/scripts/backup.sh
cd backups/TIMESTAMP
sha256sum -c SHA256SUMS
```

The backup stops writers temporarily, takes a PostgreSQL custom-format dump, captures artifact storage and uploaded sources needed by queued jobs, environment and proxy configuration, and exports Caddy certificates. It restarts previously running writers on exit and creates private files. Backups contain secrets. Encrypt off-server copies and restrict access. Configure cron using `infrastructure/scripts/backup.cron.example`; choose retention externally. The backup script does not delete old snapshots.

Runtime application data under `/app-data` is included as installation-scoped Docker volume archives in `runtime-volumes/`, together with ownership labels and checksums. Previously running application containers attached to those volumes are paused during export and restarted on failure or success. Expect a brief interruption for those server applications; published static sites continue through the independent gateway. Cache the trusted helper image first with `docker pull node:22-bookworm`. See [runtime data backups](RUNTIMES.md#runtime-data-backups) for the storage contract and archive limits.

Restore only with explicit approval and a new empty database/data directory. Keep a copy of the old installation until the restored system passes checks. Preserve the original `ENCRYPTION_KEY`, domain configuration and `DATA_PATH`; configure the new `.env` from the backup without printing credentials. Set new database connection credentials to match the replacement database. Stop writers, then:

```bash
bash infrastructure/scripts/restore.sh /absolute/path/to/backup --confirm-restore
```

The script verifies checksums, matching encryption keys and archive paths, refuses a nonempty database/data directory, restores artifacts and metadata, then starts services. Use the same container `DATA_DIR=/data` so absolute artifact paths stored in metadata remain valid. Caddy can reacquire certificates; certificate/configuration archives are retained for a separately reviewed recovery if issuance limits prevent it.

Application-data restoration additionally requires that the target named volumes do not already exist. The helper verifies their original installation ID against the restored management database, validates every archive before creating anything and refuses links/devices/unsafe paths. It restores only fresh labelled volumes; it does not replace existing application data or run application code. If restoration fails, only volumes newly created by that restore attempt are eligible for cleanup. Runtime images are loaded and containers are recovered by the worker after the data is restored. Legacy backups without a `runtime-volumes/` snapshot cannot recover runtime database or upload data.

After restoration: verify login, two production URLs, previews, rollback, secret availability and deployment of a new version. The local tests validate a SQLite metadata snapshot restored over retained immutable artifacts. The actual PostgreSQL/container backup and restore scripts still require a disposable VPS rehearsal.

## Troubleshooting

`queued` indefinitely: inspect worker/Redis logs and ensure all services use the same database. `verifying` then failed: check runtime health, DNS, public HTTPS, routing and the deployment identity response header. Dependency installation fails: the default network is disabled. Permission errors: confirm `DATA_PATH` owner uid1000 and `DOCKER_GID`. Domain verification409: wait for DNS propagation and confirm the exact TXT record. A failed deployment leaves the production pointer unchanged.

On restricted managed Node.js hosting, Turbopack can fail while starting a CSS worker with `node process exited before we could connect`. The dashboard build script explicitly sets `NODE_ENV=production` and uses webpack. From the repository root, run `npm run build -w @deployhub/dashboard`; the output is `apps/dashboard/.next`. A hosting preset that invokes `next build` directly bypasses this launcher.

If a build reports `spawn ... node EAGAIN`, the host could not create a required child process. Check the account's process and memory limits with the hosting provider. Switching bundlers or reducing worker counts does not guarantee sufficient resources, and disabling TypeScript validation does not resolve the hosting requirement.

Compiling the dashboard does not deploy the API, queue worker, website gateway or databases. Hostinger managed accounts without Docker and administrator access cannot run the complete DeployHub stack as configured here. Use the dedicated VPS installation above for source builds and server applications; do not report the service as working from a successful dashboard build alone.

Production configuration must use `NODE_ENV=production`, a reachable API origin and actual public dashboard/hosting domains. Local development values such as `localhost` do not configure public serving. A domain must resolve in public DNS before its website or HTTPS certificate can work; adding its name in hPanel alone does not establish DNS routing.
