# Security model

DeployHub is intended for a private administrator deploying their own trusted projects. It has not received an independent security audit. Container isolation alone is insufficient for hostile public tenants; require separate VMs or a hardened sandbox such as microVMs, plus network policy, quotas, abuse controls and an external review before allowing untrusted signups.

## Default GitHub-static workflow

The default `DEPLOYMENT_MODE=github-static` accepts public GitHub repositories containing browser-ready static output. It resolves a branch to a pinned commit, validates the entry and serves bounded upstream responses from fixed HTTPS GitHub hosts. It does not clone, extract, install dependencies, run a build or retain website files on disk. Metadata and logs are still retained in the platform database. GitHub availability and request limits remain serving dependencies.

Repository identifiers, directory names and request paths are validated. Traversal, dotfiles, credentials/configuration paths, unsupported source files and redirects are rejected. Requests to GitHub carry no administrator cookies, API bearer credentials or project secrets. Private repositories, arbitrary upstream hosts and GitHub tokens are not supported by this workflow.

`/admin/<project>` is a viewer page containing a sandboxed website from a separate configured hosting origin. The public resolver exposes only active, successful deployment routing metadata. Hosted scripts run in the website frame, apart from the administrator document and session. Keep the actual hosting origin separate from `DASHBOARD_ORIGIN`; a shared viewer prefix does not authorize serving repository JavaScript as administrator code. Navigation occurs within the frame. Production configuration still needs public DNS and HTTPS for that separate origin.

Upload/build endpoints are disabled by default. The remaining sections document shared authentication controls and the retained legacy paths, which are enabled deliberately with `DEPLOYMENT_MODE=legacy`. Existing persistent files and application volumes are not deleted when changing mode.

## Implemented controls

- bcrypt password hashes; random sessions and API tokens stored as SHA-256 hashes; HttpOnly, SameSite=Strict cookies and Secure cookies in production.
- First administrator setup token in production, login throttling, API rate limits and input validation.
- Exact administrator Origin validation for cookie-authenticated writes. API clients use bearer credentials. Remote CLI URLs require HTTPS.
- Role and project membership checks plus API key read/deploy/manage scopes, expiration and immediate revocation.
- ZIP entry count, declared and streamed byte limits, expansion ratio checks, duplicate-path checks, traversal/absolute-path rejection and symlink/special-file rejection. Folder uploads require validated relative paths.
- Source builds run only in non-root restricted Docker containers, never on the host shell. Source mounts are read-only; containers receive no management Docker socket or administrator credentials. Runtime images use a trusted generated recipe; uploaded Dockerfiles are not executed.
- Server containers use a read-only root filesystem, dropped capabilities, CPU/RAM/process limits, bounded writable tmp/cache mounts and private endpoints. Ownership labels and an installation identifier restrict resource reuse. Proxy headers are rebuilt, management session cookies are stripped, and hosted apps cannot set the DeployHub session cookie.
- Immutable artifacts, health checks before activation, restricted static file serving, security headers, audit events and log redaction.
- Custom domain TXT ownership checks; unverified or unknown hosts are denied by the runtime and TLS permission endpoint.

## Operational boundaries

The trusted worker has access to the Docker socket to orchestrate builds and runtime containers. Compromise of that worker is equivalent to host compromise. The API, gateway and uploaded build/runtime containers must never receive that socket. Protect the server and its images accordingly. The gateway accepts only validated loopback or named managed-container endpoints; arbitrary user-supplied upstream URLs are not a supported routing feature.

The default `BUILD_NETWORK=none` prevents dependency downloads and outbound build traffic. To build framework sources with uncached dependencies, the operator must deliberately provide a controlled network or set `BUILD_NETWORK=bridge` for their own trusted projects. Bridge networking can reach private networks and metadata endpoints. A production multi-tenant service needs a separate egress proxy/firewall that denies internal destinations; that policy is not supplied here.

Runtime containers use a separate application network and do not join the management PostgreSQL/Redis network. That network is internal by default, so external databases, mail, payment and API endpoints need an explicitly approved egress policy. `RUNTIME_NETWORK_INTERNAL=false` permits wider access and is a private-operator setting, not public multi-tenant isolation. Credentials alone do not establish network access. Project secrets are injected into the selected environment; they are not shared with another project.

Automatically configured SQLite storage is private to the project/environment. Preview volumes are separate from production storage and a preview runtime cannot be promoted by a pointer switch. Existing production databases are not automatically migrated to test a candidate; review production schema upgrades separately. Rollback to an old image does not roll database content or schema back and can fail if a migration made it incompatible.

Build tmpfs, CPU, RAM, process count and duration have hard container limits. The writable output bind mount is scanned once per second for file-count and size limits; this is a **soft disk bound**, not a filesystem quota. Apply a dedicated quota-limited filesystem to the data directory. Upload limits are checked per file and in aggregate, but simultaneous uploads can consume temporary disk before aggregate validation. Add reverse proxy request-size limits and host disk quotas for Internet-facing deployments.

Use different registrable domains for administration and hosted websites. Cookie isolation and browser-origin boundaries are essential. Do not enable permissive credentialed CORS, place secrets in served assets, or route hosted code through the administrator origin. Protect `.env`, backup files, API tokens and encryption keys. CLI exclusions cover common names but cannot identify arbitrary secrets embedded in source; review uploads.

Backups contain database hashes, artifacts, certificate keys and the environment encryption key. They are created with private filesystem permissions but are not encrypted by the script. The standard PostgreSQL/artifact backup does not capture runtime SQLite Docker volumes; take quiesced snapshots of those volumes and verify restoration before relying on server deployments. Retained image archives do not replace application-data backups. Encrypt off-server copies using your organization's backup tooling. Keep recovery credentials separately. Retention is deliberately manual; no automatic deletion is configured.

Two-factor authentication, email password-reset delivery, GitHub OAuth/webhooks, preview passwords, signed public artifact URLs, resumable uploads, automated security patching and security alert delivery are not implemented. Keep administration private and document manual account recovery before production. Do not expose this platform as a public shared hosting provider.

The operator-only reset script requires database access and explicit `--confirm-reset`; it revokes existing sessions and API keys while replacing the password. The dependency lockfile includes explicit patched transitive overrides for Prisma's configuration tooling. Check `npm audit` and repeat setup/build/tests when changing those overrides.

Docker/runtime argument generation and real local HTTP proxy behavior have tests; actual Docker/Next.js deployment was not verified on the Windows development host because Docker and a usable WSL backend were absent. Worker readiness reports this limitation. PHP/Python/Ruby and arbitrary privileged application stacks are not supported by the Node adapters. Do not treat compatibility detection, an accepted upload, or a passing proxy test as a successful user application deployment.
