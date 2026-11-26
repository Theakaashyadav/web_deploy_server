# Administrator manual

## First login

Local setup accepts a new administrator name, email and a password of at least 12 characters. Production additionally requires the private `SETUP_TOKEN` generated in `.env`. The first-admin flow closes after creation. No credentials are hardcoded. Keep the dashboard reachable only to trusted operators.

For a lost password, an authorized server operator can run `docker compose exec api node --import tsx infrastructure/scripts/reset-password.ts YOUR_EMAIL --confirm-reset`. This replaces that account's password, revokes all its sessions and API keys, and displays a new random password once. Run it only in a private terminal and store the result securely. Email-based recovery is not implemented.

## New projects and versions

Create a project with a name and build settings. The server derives a DNS-safe permanent slug; duplicate names receive a suffix. Upload a ZIP, individual files, or a folder with relative paths. Files may be nested inside several wrapper folders. The worker scans for website entry HTML, framework package roots and existing publish output while preserving asset paths. The upload progress bar measures browser transfer; deployment stages and logs come from the server.

Folder selection and folder drag-and-drop exclude dependency/cache directories and common local credential files. The dialog shows skipped items and retains the remaining selected files for retry. Do not rename or flatten your website before uploading. If several independent websites are found, use the upload dialog's optional Root directory / Output directory fields to select one; their paths are relative to the original upload. Uploaded framework source still requires the isolated Docker build worker unless a ready build output is present.

Uploads use the configured `MAX_UPLOAD_BYTES` and `MAX_FILES` limits; the default file payload limit is 100 MiB. Dashboard proxy buffering includes an additional bounded allowance for multipart headers and path metadata, so folders over 10 MiB can reach the API intact. If these limits change in production, rebuild the dashboard image as well as updating the API configuration. Malformed paths, conflicting names and incomplete uploads return actionable errors; temporary files from rejected requests are cleaned up.

Choose preview for review. Production upload and promotion require explicit authorization. Successful artifacts contain a nonempty `index.html`; missing output or unavailable Docker builds fail visibly. The previously published version remains active. Framework detection is available when the project framework is `auto`; manual build/output configuration overrides defaults.

Open a deployment to inspect stored logs. Polling updates its current state; the logs endpoint also supports SSE. Download retained successful artifacts from the deployment API. Roll back to a successful deployment to restore it without rebuilding.

Disable or archive a project to stop serving it while retaining versions. Restore/enable it through project settings. Deletion requires confirmation and removes project metadata and its retained files. Cancel active work before deleting a project.

## API keys

Create a named key with read, deploy and/or manage scopes. Optionally restrict it to one project and give it an expiration. The full key is displayed only on creation; the server stores its hash. Copy it to a secret manager. Revocation takes effect on the next request. A project-scoped key cannot access another project or create global resources.

## Custom domains

Add a hostname to a project. Publish the exact `_deployhub.<hostname>` TXT record returned by the API and point the hostname at the server. Verification must pass before the runtime accepts it. Production Caddy issues a certificate only when its permission endpoint approves the hostname. The dashboard reports `awaiting_proxy` after verification; it does not claim a certificate was issued. DNS and certificate validation require real domains.

## Files and server health

The file manager lists published production artifact files and previews regular text files up to 1 MiB. Artifacts are immutable. To edit, download/change the website locally and upload a new version. Draft editing is not implemented.

Monitoring shows actual CPU samples, memory, disk, uptime and queue depth. In Docker, OS readings have a documented host/container scope. Container counts, bandwidth and certificate expiry are unavailable; no simulated values are substituted. Backups and updates are administrator shell workflows described in the VPS guide.
