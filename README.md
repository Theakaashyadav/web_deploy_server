# DeployHub

A self-hosted website deployment platform with a Next.js dashboard, Express API, Prisma database, persistent worker, independent website runtime, CLI, and local MCP bridge.

**Static deployment is locally tested. Isolated Node.js/server application adapters are implemented, but their Docker builds have not been verified on this Windows host. This is not an audited public multi-tenant hosting product.** See [feature status and limitations](docs/STATUS.md) before production use.

## Separate projects

DeployHub lives in `C:\Users\Theakaashyadav\Desktop\hosting`. The Avynex website lives in `C:\Users\Theakaashyadav\Desktop\Avynex`. Each project has its own source, package manifest, environment configuration, database and development process. Run DeployHub commands from the `hosting` folder.

| Local service | Address |
| --- | --- |
| Avynex website | `http://localhost:3000` |
| DeployHub dashboard | `http://localhost:3100` |
| DeployHub API | `http://localhost:4100` |
| DeployHub hosted websites | `http://<project-slug>.localhost:4101` |

DeployHub uses these dedicated local ports so both projects can run together. Docker services keep their separate internal ports (`3000`, `4000`, `4001`); the Docker network is independent of the local development addresses above.

## Start locally

Requirements: Node.js 22.18 or newer and npm. A working Linux Docker engine is required for framework source builds and server-rendered applications. SQLite makes static development possible without Docker or a database server. Docker Desktop and a usable WSL installation were not available on the checked development computer; see [runtime setup](docs/RUNTIMES.md) before retrying a server application.

```powershell
npm ci
npm run setup
npm run build -w @deployhub/cli
npm run build -w @deployhub/mcp-server
npm run dev
```

Open **http://localhost:3100** and create the first administrator. There are no default credentials. Use this exact dashboard origin; cookie writes validate the Origin header. API: `http://localhost:4100`; hosted websites: `http://<project-slug>.localhost:4101`. Preview hosts include the deployment ID. Some OS tools do not resolve `.localhost` automatically; browsers generally do. For HTTP testing, connect to `127.0.0.1:4101` and set the `Host` header.

`npm run setup` creates `.env` only if absent, generates the SQLite Prisma client and applies the development schema. Production uses the separate PostgreSQL schema and committed migration. SQLite paths are relative to `packages/database/prisma`; all services must share the same `DATABASE_URL` and absolute `DATA_DIR`.

The local runner starts four separate processes. Stopping the dashboard or API alone leaves the website runtime serving published artifacts. `Ctrl+C` stops the entire local stack. Keep the runner terminal open while using the platform.

## Deploy a website

Create a project, upload a ZIP or folder, and choose preview or explicitly authorize production. The worker scans nested folders to find the website or a ready `public`, `dist`, `build`, or `out` folder, preserves its asset structure, validates the entry HTML, creates an immutable artifact and checks it through the runtime before returning `live`. Wrapper folders and accompanying README files do not require rearranging your source. If the upload contains several independent websites, select the intended Root/Output directory. Updating a production project keeps its URL. Rollback reuses an existing verified artifact.

Server-rendered Next.js and supported Node applications follow a separate container path. The dashboard reports actual worker readiness from recent Docker checks; it does not claim a source deployment is available when Docker is absent or disabled. Failed uploads retain their source, so **Retry as preview** can create another version without uploading again after the worker is ready. Runtime previews keep separate secrets/storage and cannot be promoted by switching a pointer: create an explicitly authorized production retry instead. Static previews retain one-click promotion.

Applications must listen on the supplied `PORT=3000` and an external container interface. Prisma SQLite applications can use a private application-data volume when no database URL was supplied. External databases, payments, mail and other integrations still need their own configuration and approved network access; DeployHub never borrows another project's credentials or data.

```powershell
npm install --global ./apps/cli
deployhub login --url http://localhost:4100
cd path/to/your/website
deployhub init
deployhub deploy --preview
deployhub deploy --prod
```

Create a scoped API key in the dashboard for CLI login. Prefer `DEPLOYHUB_TOKEN` from your secret manager, particularly on shared Windows machines. `--prod` explicitly authorizes a production change. ZIP packaging always excludes common secrets, dependencies and local credentials. Review packaged source when using custom credential filenames.

## Verify

```powershell
npm run typecheck
npm test
npm run test:integration
npm run build
```

The integration suite creates isolated test metadata and starts actual API, worker and runtime processes. It deploys sample HTML, exercises CLI uploads, updates, rollback, independent projects, authorization, domain rejection, restart persistence and a local database snapshot restore. It does not certify the VPS Docker, ACME or PostgreSQL restore paths.

The optional Docker integration fixture is explicitly skipped without `RUN_RUNTIME_DOCKER_TESTS=1` and a working Linux Docker backend. It creates uniquely labelled disposable resources to check a Node server and private SQLite-volume recovery:

```powershell
$env:RUN_RUNTIME_DOCKER_TESTS = '1'
node --import tsx --test tests/integration/runtime-docker.test.ts
```

Proxy tests exercise real local HTTP servers, not a successful Docker/Next.js application build. No actual server-rendered user website was deployed on this host during these checks.

## Linux VPS

Use a dedicated Ubuntu VPS with Docker support, at least 2 CPUs / 4 GiB RAM, and separate administrator and hosting domains. Copy the source to `/opt/deployhub`, review the installer, then run:

```bash
cd /opt/deployhub
sudo bash infrastructure/scripts/install.sh --approve-server-changes --enable-private-source-builds
```

This command explicitly authorizes installing Docker if missing, starting the new stack, and enabling dependency downloads and runtime network access for your own trusted source projects. The installer does not rewrite an existing `.env` or change firewall rules. Read [the VPS guide](docs/VPS.md) before running on an existing server. Production Docker, DNS and certificates require external infrastructure and were not validated on the Windows development host.

## Documentation

- [Architecture and deployment lifecycle](docs/ARCHITECTURE.md)
- [Administrator manual](docs/ADMIN.md)
- [VPS installation, DNS, updates, backup and disaster recovery](docs/VPS.md)
- [Source builds, server runtimes and worker setup](docs/RUNTIMES.md)
- [CLI, API and Codex MCP integration](docs/integrations.md)
- [OpenAPI specification](docs/openapi.json)
- [Security model and operational limits](docs/SECURITY.md)
- [Feature status and verification results](docs/STATUS.md)

Framework detection distinguishes static HTML, Vite/React/Vue builds, Angular, Astro, SvelteKit, Next.js exports and supported server modes. Node/Next/Nuxt and compatible Node adapters use isolated Docker runtimes; unsupported provider-specific adapters fail clearly. PHP, Python, Ruby and arbitrary uploaded Dockerfiles require additional adapters. Ready static output remains the verified path available without Docker.
