# Source builds and server applications

DeployHub distinguishes ready static files from source projects and server applications. A folder containing a Next.js application with API routes, login, database access or server rendering needs a Node.js runtime. Renaming files or moving `page.tsx` into `public` cannot make that application static.

The deployment worker builds and runs supported Node.js applications in restricted Linux Docker containers. Uploaded code never executes on the management host. A worker readiness indicator reports the actual Docker daemon and configuration state; missing or stale worker information is not reported as ready.

## Windows setup

This development computer was checked and did not have Docker Desktop or a usable WSL installation. The existing static-file path continues to work. Source builds and server runtimes cannot run here until a Linux container backend is available.

Review `infrastructure/scripts/enable-source-deployments.ps1`. In an **administrator PowerShell**, the following explicitly authorizes installing WSL/Docker Desktop if needed and enabling network access for builds of your own trusted projects:

```powershell
cd C:\Users\Theakaashyadav\Desktop\hosting
powershell -ExecutionPolicy Bypass -File .\infrastructure\scripts\enable-source-deployments.ps1 -ApproveSystemChanges
```

The helper preserves existing secrets and project data, makes a private environment-file backup, and never restarts Windows automatically. Docker Desktop may need you to finish its initial setup, accept its terms and select Linux containers. If Windows requests a restart, do that manually, open Docker Desktop, then rerun the helper. The helper enables DeployHub only after the Linux Docker engine responds successfully. See [Docker's Windows installation guide](https://docs.docker.com/desktop/setup/install/windows-install/) for prerequisites and licensing.

Restart DeployHub after enabling its worker. Failed uploads retain their source. Use **Retry as preview** after the readiness check turns available. Static previews can be promoted directly; a server preview's **Deploy to production** action creates an explicitly authorized production build with production secrets and storage. Preview database volumes never become production merely by changing a pointer.

## Linux worker

Use the provided Compose topology with a Linux Docker daemon. The trusted worker alone receives the Docker socket. Runtime containers join a separate application network; they do not join the management database/network or receive administrator credentials. Configure the runtime gateway for Docker-network routing in Compose and loopback routing when running directly on a desktop.

`BUILD_DOCKER_ENABLED=true` and a reachable Linux Docker daemon are required. `BUILD_NETWORK=none` prevents dependency downloads. A controlled build network is recommended; `bridge` deliberately permits network access for a private operator's trusted projects. This does not provide hostile multi-tenant egress isolation. See [the security boundaries](SECURITY.md).

For a dedicated VPS, create the source-only package with `npm run package:vps`, transfer `exports/deployhub-vps.zip`, and extract it into a new installation directory. The package excludes local credentials, development databases and uploaded website source. Transfer a retained website separately after the platform is running; do not merge a website repository into DeployHub. SSH host/user/key authorization and dashboard/hosting domains must be supplied before remote deployment.

## Application data and configuration

Each server deployment has its own immutable image and verified preview endpoint. SQLite applications use isolated project storage; preview data is kept separate from production data. The application must still have its required configuration. External PostgreSQL/MySQL, email, payment and API services require real endpoints and credentials entered as encrypted project environment variables. DeployHub cannot invent those accounts or safely reuse credentials from a different project.

The default application network is internal. External server-side API or database access also needs an approved egress policy. A private operator can deliberately configure `RUNTIME_NETWORK_INTERNAL=false`; do not expose hostile uploads to unrestricted networking. Changing an already-created Docker network's internal setting requires a separately reviewed network migration, not merely an environment-file edit.

Database initialization happens inside the application container. Existing production schemas must not be changed merely to test a preview. Review application-specific migrations before production upgrades. Creating the website's own first administrator or seed content remains an application setup task.

Retained runtime images and persistent database volumes are different backup objects. Follow the runtime-aware backup procedure before relying on runtime deployments for production. Static rollback keeps serving immutable files; server rollback also requires a working retained runtime image and compatible persistent data.

Every server application receives a private persistent volume at `/app-data` and `DEPLOYHUB_DATA_DIR=/app-data`. Generic Node applications must explicitly store uploads, sessions or other writable files there; DeployHub does not override an application's own `DATA_DIR`. Production storage is scoped to its project, while preview storage is scoped to the individual deployment. Files written only to `/tmp` are temporary.

### Runtime data backups

The normal `infrastructure/scripts/backup.sh` now captures labelled application-data volumes in addition to PostgreSQL and artifact/image archives. It reads this installation's ID from the management database and selects only volumes/containers with matching DeployHub ownership labels. The helper pauses previously running application containers attached to those volumes while taking their snapshots, then restarts those containers even when export fails. Those server applications have a brief maintenance interruption; the static-file gateway remains running.

Archives and their ownership metadata are stored under each backup's `runtime-volumes/` directory and covered by `SHA256SUMS`. They contain SQLite databases and any other application files saved under `/app-data`. Keep backups private and encrypt off-server copies. The trusted `node:22-bookworm` image must already be cached (`docker pull node:22-bookworm`) so backup never downloads an image while an application is paused.

The normal confirmed restore checks the restored installation identity, archive checksums, safe paths and regular-file types. It refuses existing destination application volumes and never executes an uploaded application command during restoration. Fresh volumes are restored by a fixed, network-disabled helper with a read-only root filesystem and only the CHOWN capability needed to assign data to uid 1000. Retained runtime containers are recreated later by the worker from their saved immutable images. Existing production application databases are not automatically migrated during deployment or restoration.

Volume archives with symbolic/hard links, devices, special permission bits or more than the configured expanded-data budget are rejected. The default per-volume archive budget is 8 GiB; operators can set `MAX_RUNTIME_VOLUME_BACKUP_BYTES` for larger private datasets. External managed databases need their provider's own backup procedure. The Python safety tests run without Docker; actual Docker volume export/restoration still needs a disposable Linux VPS rehearsal before production use.

Supported adapters do not imply support for every possible stack. PHP, Python, Ruby, arbitrary Dockerfiles and applications requiring privileged containers need separate reviewed adapters. Unsupported stacks should produce an explicit compatibility message, not a fabricated live deployment.
