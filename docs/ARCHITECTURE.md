# Architecture

```text
Browser -> Next.js dashboard -> Express authentication + REST API -> Prisma
CLI / local MCP bridge -------> Bearer-authenticated API          -> database
API -> queued deployment metadata -> worker resolves GitHub commit
    -> validates static entry -> gateway health check -> production pointer
/admin/<project> -> sandboxed viewer -> separate website gateway origin
                                    -> GitHub files at pinned commit, no disk copy
```

The default deployment mode is `github-static`. A deployment stores repository settings, a pinned commit, lifecycle state and ordered logs. Its artifact has `kind: github-static`, an empty local path and metadata integrity information. No clone, extraction, dependency installation, website build or local static copy occurs on this path. Responses exist transiently in bounded memory; GitHub remains the source for subsequent requests.

The selected branch is resolved only when deploying. It does not track moving branch contents during serving. The worker validates ready HTML and verifies the candidate through the gateway before marking it live. Production changes through an atomic metadata pointer only after checks pass. Previews leave that pointer unchanged. Explicitly authorized promotion and rollback recheck the selected deployment before activation; its commit must remain available upstream.

The public project resolver returns only an active, successful deployment's separate website URL and deployment identifier. `/admin/<slug>` creates an isolated viewer using that URL. The actual website has its own origin, so root-relative assets and SPA routes work without rewriting repository files. The parent project URL is an entry/viewer address; navigation within the website occurs inside the embedded site.

The gateway accepts active project subdomains or verified custom domains and resolves the production pointer per request. GitHub requests use fixed HTTPS GitHub hosts, validated repository identifiers, a pinned commit and safe publish/file paths. Hidden files, traversal, credentials/configuration files and unsupported source extensions are rejected. Static responses have bounded upstream time and size. Administrator sessions and bearer tokens are not forwarded to GitHub.

SQLite and database polling support local development; production can use PostgreSQL and Redis/BullMQ. The worker claims queued records conditionally to prevent duplicate execution. API, dashboard, worker and gateway restart independently, but serving still depends on metadata availability and GitHub connectivity. There is no persisted website cache or automatic deployment webhook.

## Compatibility

`DEPLOYMENT_MODE=legacy` deliberately enables the previous upload/build API. Existing deployments remain retained and can continue serving; changing the mode does not remove their files or volumes. Legacy static artifacts live under `DATA_DIR`, and server applications use isolated Docker images/containers plus separately managed application volumes. Those paths retain the build/socket/network/backup constraints described in the [runtime](RUNTIMES.md) and [security](SECURITY.md) guides.

The database, PostgreSQL/Redis/Caddy volumes and deployment logs are platform storage. The promise of no stored website files applies to new GitHub-static deployments, not platform metadata or retained legacy projects.
