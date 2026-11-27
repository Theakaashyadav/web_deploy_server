# Feature status and verification

DeployHub's default workflow is **public GitHub static sites**. The dashboard takes a repository link, branch and publish directory; a worker resolves a commit, checks ready HTML and verifies it through a separate website gateway. Deployment records retain metadata and logs while website files remain on GitHub.

| Area | Behavior |
| --- | --- |
| Public website | Websynk homepage, service/contact links and admin navigation |
| Static deployments | Public GitHub URL, default or selected branch, committed publish directory, pinned commit and checks before live status |
| Sharing | `/admin/<project-slug>` opens a sandboxed viewer served from a separate website origin |
| Version control | Independent previews, authorized production publication/promotion/rollback and failed-update protection |
| Storage | Platform metadata/logs only for GitHub-static; no clone or retained website files |
| Developer tools | CLI GitHub deployment flags, REST endpoint and local MCP GitHub tool |
| Compatibility | Retained legacy static/runtime serving; new uploads/builds require explicit `DEPLOYMENT_MODE=legacy` |

## Verification boundaries

Run `npm run typecheck`, `npm test`, `npm run test:integration` and `npm run build` after relevant changes. GitHub tests use controlled upstream responses; integration exercises real local API, worker and gateway processes with disposable metadata. They do not publish a GitHub repository, create public DNS or issue certificates. Legacy integration explicitly enables legacy mode.

Actual Docker server builds, PostgreSQL/Redis production operation, public DNS/HTTPS routing, certificate issuance and VPS backup restoration require external verification. Existing container planning/proxy tests do not certify a user's server application deployment. A dashboard-only build on managed hosting still does not supply the full platform.

No public deployment URL should be reported unless the deployment was actually checked. Previews at `.localhost` are local to the development computer.

## Limits

Only ready public static repository content is supported by default. This workflow does not run JSX/TypeScript sources, SSR, API endpoints, dependency installation, uploaded Dockerfiles or arbitrary build commands. Build outside DeployHub and commit static output before deploying.

GitHub OAuth/private repositories, push webhooks/automatic deployment, an offline mirror and a persistent CDN cache are not implemented. GitHub availability and request limits affect serving. Each deployment pins one commit; upstream deletion or unavailability can break serving or rollback.

Other pending features include preview passwords, team invitation controls, two-factor authentication, email password resets, automated alerts and retention cleanup. Legacy container hosting retains its Docker/socket/network/backup requirements. See [security boundaries](SECURITY.md) and [runtime setup](RUNTIMES.md).
