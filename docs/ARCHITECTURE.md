# Architecture

```text
Browser -> Next.js dashboard -> Express authentication + REST API -> Prisma
CLI / local MCP bridge -------> Bearer-authenticated API           -> PostgreSQL
API stores upload + queued deployment row                          -> Redis/BullMQ
Worker -> safe extraction -> framework preset -> restricted Docker build
       -> immutable static artifact OR isolated runtime image/container
       -> gateway/public health checks -> atomic production pointer
Internet -> Caddy HTTPS -> independent website gateway -> retained static files
                                                    -> private runtime containers
```

Local development substitutes SQLite for PostgreSQL and a database-backed polling queue for Redis. Both queues keep deployment metadata durable; the worker conditionally claims queued records to prevent duplicate execution. Production BullMQ adds bounded concurrency. Interrupted jobs become eligible for recovery after their build lease expires, with orphan build containers removed by their generated deployment name. Recovery is delayed by the build timeout plus two minutes.

Each project owns deployments, domains, encrypted variables and project memberships. Each deployment owns ordered log events and an artifact with checksum and byte count. Artifacts have a `kind` of `static` or `runtime`; runtime metadata identifies the immutable image, managed container and private endpoint. The production pointer changes in a database transaction only after the candidate passes gateway checks. Public production configuration also verifies the preview through HTTPS and checks its deployment identity. Same-origin redirects are followed within a bounded redirect limit; cross-origin redirects fail verification.

Previews leave production unchanged. Static promotion/rollback reuses retained files. Runtime previews use preview settings and isolated storage, so they cannot become production through pointer switching. An authorized production retry rebuilds retained source with production configuration; older successful production runtime artifacts can be reactivated only when their image and persistent data remain compatible. The retry API copies retained upload source into a new deployment and preserves deployment-specific overrides.

Runtime lookup joins the hostname to an active project or verified custom domain. It resolves the production pointer per request and either serves static files or proxies HTTP/WebSocket traffic to a validated private runtime endpoint. This lets the API, dashboard and worker restart independently. The gateway receives no Docker socket. It still depends on metadata and retained storage; container runtimes also need a healthy Docker daemon and application storage.

Build source is never executed on the management host. Ready static websites skip install/build. Framework sources use non-root restricted Docker builders. Supported server projects produce an immutable image from a trusted generated recipe, rather than executing an uploaded Dockerfile. The worker starts a non-root runtime with a read-only root filesystem, resource limits, bounded writable cache/tmp locations and no Docker socket. Managed-container ownership labels and an installation identifier prevent attaching another installation's named resources.

The worker publishes its actual Docker/build/runtime capability report. The API considers it stale after 45 seconds and never reports a missing worker as ready. The dashboard exposes this report and a setup guide before users retry retained source. Framework detection reads configuration as text, preserves package build scripts and lockfile modes, and distinguishes SSR adapters from complete static output. It does not evaluate uploaded configuration on the host.

Artifacts and uploads live under `DATA_DIR`, including retained runtime image archives and metadata. PostgreSQL/Redis use Docker volumes; Caddy owns separate certificate/configuration volumes. Automatically configured SQLite applications use separate managed Docker volumes: previews are isolated by deployment, while production data belongs to the project. Fresh SQLite storage is initialized inside the container; testing a candidate does not automatically migrate an existing production database. The static filesystem backup script does not capture these runtime data volumes; they require a quiesced runtime-aware backup/restore procedure. S3 and public multi-tenant isolation remain extension work. See the security guide for network and disk boundaries.

Docker adapters and proxy logic are implemented, but actual Linux image builds, SSR application startup, daemon restart recovery and runtime-volume restoration need external verification. The development host had no Docker/usable WSL backend; local HTTP proxy tests are not evidence that the user's Next.js application was deployed.

The database schema contains reserved models for later Git integration, backups and metric history. Their presence does not imply that those products are implemented. Live monitoring is sampled from the service operating system and filesystem; unavailable measurements are returned as null.
