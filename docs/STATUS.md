# Delivery status and verification

Verified locally on Windows with Node.js 22.18 and Chrome on November 26, 2026. Static deployment, framework planning, worker readiness and real local HTTP proxy behavior have local checks. Isolated Node/server runtime adapters are implemented, but actual container builds and server applications were not verified because Docker and a usable WSL backend were absent. The full product brief remains broader than this implementation; the gaps below are explicit.

## Implemented

| Area | Delivered behavior |
| --- | --- |
| Dashboard | Responsive Next.js application; first-admin setup/login; overview; project search/filter/sort/pagination; upload progress and cancellation; history/logs; confirmed promote/rollback/archive/disable/delete; themes; real metrics |
| Authentication | bcrypt passwords; hashed persistent sessions; production setup token; cookie Origin checks; bearer keys with scope/project/expiry/revoke; operator password recovery; schema/middleware for roles and memberships |
| Static deployment | ZIP, folder and individual-file uploads; extraction limits and path/symlink checks; framework detection; persistent queue; immutable artifacts; runtime health checks; stable production URL and independent previews; atomic version switching |
| Framework builds | Static/runtime-aware plans, package-manager lockfile handling and preserved package build scripts; restricted Docker build invocation with limits, timeout, cancellation, secret injection and redacted logs; honest failure when prerequisites are unavailable |
| Server runtimes | Docker image/container adapter for Next/Node/Nuxt and compatible Astro/SvelteKit/Angular Node modes; generated image recipes, private HTTP/WebSocket gateway, runtime health checks and retained image metadata; Docker execution still requires external verification |
| Worker readiness and retry | Actual recent Linux-Docker/configuration reports, unavailable status for stale/missing reports, setup-guide download and new preview versions from retained source; production retry requires explicit authorization |
| Developer tools | Installable CLI; preview default and explicit production flags; JSON output; secure ZIP packaging and ignore rules; actual deployment polling; local stdio MCP with12 tools and authorized roots; reusable config/instructions |
| Domains and serving | TXT ownership verification; runtime host checks; Caddy permission endpoint and HTTPS configuration; caching/ETag/SPA fallback/custom404; API logs as JSON or SSE |
| Project inspection | Immutable artifact download; production file listing/text preview; saved build settings; write-only AES-GCM encrypted environment values; activity and session APIs |
| Infrastructure | PostgreSQL schema and migrations; Redis/BullMQ path; separate dashboard/API/worker/runtime containers; Caddy; persistent storage; guarded install/update/health/backup/restore scripts; installation-scoped quiesced runtime data-volume snapshots and fresh-volume restoration; cron example |

## Executed checks

| Check | Result and boundaries |
| --- | --- |
| `npm run setup` | Passed; local SQLite database and Prisma generation; Windows absent-file creation handled explicitly |
| `npm run build` | Passed; CLI, MCP server and Next.js production build |
| `npm run typecheck` | Passed for API/core/worker and dashboard; CLI/MCP TypeScript compilation passes in build |
| `npm test` |73 passing tests covering archive/upload security, nested layouts and assets, static/runtime framework plans, Prisma requirements, CLI/MCP behavior, private proxy headers/cookies/WebSockets, container command limits, readiness reports and retained-source policies; these do not certify Docker application execution |
| `npm run test:integration` |14 passing child scenarios plus parent suite: authentication, independent sites/duplicate names, previews/updates/rollback, failed-update protection, scoped keys/domain rejection, CLI/folder/ZIP uploads, Chrome/dashboard upload above 10 MiB with nested assets, invalid metadata/path collisions, truthful worker readiness and retained-source retry, real local dynamic HTTP gateway redirects/POST with preview-production guards, queue/restart recovery, local restore and password recovery. This does not execute a Docker server application. |
| Optional Docker runtime fixture |Explicitly skipped locally: `RUN_RUNTIME_DOCKER_TESTS=1` and an available Linux Docker engine are required. The fixture is intended to verify a real Node container and private SQLite volume across container recreation; no such execution is claimed here. |
| Python runtime-volume safety tests |13 passing tests covering archive traversal/link/device/mode/budget rejection, exact ownership labels, foreign-writer refusal, restart after export failure, existing-volume protection and restricted helper-container command arguments. Python compilation and backup/restore Bash syntax checks also pass. These tests do not execute Docker volume export or restoration. |
| Chrome browser QA | Passed setup, authenticated project, real file upload to live preview, correct preview-only URL, desktop1440/tablet768/mobile390 overflow checks, drawer open/close, no page errors; screenshots in `tests/artifacts` |
| Dependency audit |`npm audit` and the production-only audit report 0 vulnerabilities after patched direct dependencies and explicit transitive overrides |
| Shell parsing |All5 shell scripts pass Bash syntax checks; this is not runtime verification of VPS actions |

The unit test for public HTTPS verification uses a controlled fetch result; there was no real certificate issuance. Local website assertions connect to the actual runtime and set the Host header. No public website URL was created. Browser QA uses a separate disposable database and preserves the user's regular database, projects and credentials.

Project separation was checked in Chrome while Avynex remained running: Avynex at `http://127.0.0.1:3000/en`, DeployHub at `http://localhost:3100`, and the DeployHub API at `http://localhost:4100`. Their source and data directories are independent. The local launcher anchors its working directory to DeployHub and refuses occupied ports before starting services.

The folder-upload regression additionally ran with `DEPLOYHUB_BROWSER_TEST=1`: Chrome selected a real folder containing a README, several nested directories, a `public/index.html`, linked CSS/JavaScript and a 12 MiB asset. The upload crossed a separate Next.js dashboard proxy, became live, and the rendered website loaded its stylesheet and script. A disposable account/database/dashboard copy was used; the user's project and credentials were preserved. The server log confirmed the original 500 came from Next's former 10 MiB body-buffer limit; it now follows the configured upload budget with bounded multipart overhead.

## External verification required

The selected production target is a dedicated Linux VPS. Its SSH address/user and administrator/hosting domains have not yet been supplied, so installation and real source-application deployment there remain pending. No VPS address, public deployment URL or successful remote deployment is assumed.

- Docker image builds and container resource enforcement on a Linux daemon; dependency installation inside the build network; actual React/Vite compilation and Next/Node/Nuxt SSR startup. The adapter code, runtime plans and gateway are implemented, but no user's server-rendered website was deployed on this development host. The optional Docker integration fixture is explicitly skipped without its enable flag and an available Linux backend.
- PostgreSQL migrations and database access in Compose, Redis/BullMQ operation and interrupted Docker-worker recovery on a VPS.
- Public DNS, live domain ownership, external HTTPS health verification and ACME certificates. Unknown/unverified domain rejection was tested.
- Actual PostgreSQL/artifact/runtime-volume backup and disaster-recovery rehearsal. The supplied backup helper quiesces owned runtime writers, snapshots private application volumes and restores only fresh destinations; retained runtime images are also required. Its safety logic has Python tests, but actual Docker tar export/extraction, uid ownership and service recovery still require Linux VPS verification. The local restore test copies SQLite metadata over retained immutable static artifacts; it does not exercise `pg_restore` or real runtime-volume recovery.

## Not implemented

PHP/Python/Ruby and arbitrary uploaded Dockerfile adapters; unsupported provider-specific/serverless runtimes; GitHub OAuth/import/webhooks/PR previews; S3 storage; resumable uploads; preview passwords; QR sharing; project duplication; artifact retention cleanup; editable draft file manager; runtime image file-browsing/static-ZIP download UI; per-file image preview/download UI; team invitation/user/role management UI; TOTP two-factor authentication; email password resets; automated alert delivery; bandwidth/container/certificate-expiry telemetry; dashboard backup scheduling/retention or restore controls; wildcard DNS-provider certificate automation; primary-domain/www redirect management.

Some models reserve space for future capabilities. Unsupported areas explain their status rather than returning simulated successes. Runtime previews have separate settings/storage and cannot be activated as production by pointer switching; create an authorized production retry. Applications with databases, email, payments or other external services still need their own credentials, initialization and network access. Operator shell backup/recovery includes private files, explicit restore approval and installation-scoped runtime data-volume snapshots. Off-server encryption, retention, external database backups and a successful Linux recovery rehearsal remain operator responsibilities.

The build output bind mount has a soft monitored disk bound, not a hard filesystem quota. The worker's Docker socket is a privileged trust boundary. Default network isolation prevents downloading dependencies; allowing egress requires deliberate operator configuration. See [security boundaries](SECURITY.md). Do not expose this installation as a public multi-tenant hosting service without stronger isolation and an independent security review.
