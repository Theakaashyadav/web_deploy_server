# Administrator manual

Open `/admin` from the Websynk homepage's admin icon. `/login` redirects there. Create the first administrator with a name, email and password of at least 12 characters; production also requires the private setup token. There are no default credentials.

## Connect a static website

1. Create a project with a descriptive name. Its permanent slug determines `/admin/<slug>`; duplicate names receive a suffix.
2. Paste a public GitHub repository URL in the deployment dialog.
3. Leave branch blank for the repository default, or specify a branch. Select the publish directory: `.` for repository-root HTML, `docs` or `dist` for output committed there.
4. Create a preview and check its logs. The worker resolves a commit, checks browser-ready `index.html` and validates the candidate through the website gateway.
5. Explicitly authorize production when ready, or promote the checked preview using the production confirmation.

GitHub-static deployments save metadata and logs, not website files. Assets are requested from the pinned GitHub commit when visitors open the site. Pushing another commit does not update an existing deployment: create a new version. Source-only React/Vite/Next repositories need their own external static build workflow and committed output. DeployHub does not install dependencies, build source or run an application server in this workflow.

The shared project address opens an isolated viewer. Website navigation takes place inside it on a separate hosting origin. This keeps project scripts separate from the administrator session while preserving `/admin/projectname` as the public entry.

## Versions and project settings

Preview leaves the current production pointer unchanged. Publishing, promotion and rollback require explicit production authorization. A failed deployment retains useful error logs and does not replace the working production version. Rollback still needs the pinned commit available on GitHub; no local mirror is kept.

Enable SPA fallback only for a ready client-side application that should serve `index.html` on extensionless routes. Missing assets should remain missing rather than return application HTML.

Disable or archive a project to stop serving it while retaining history. Restore it in settings. Deletion requires confirmation; cancel active work before deleting. Existing legacy files/volumes are not automatically removed when selecting GitHub-static mode.

## API keys and accounts

Create named keys with read, deploy and/or manage scopes. Restrict keys to a project and give them an expiration when appropriate. The full key appears only on creation; the server saves its hash. Revocation applies to subsequent requests.

For a lost password, an authorized server operator can run `docker compose exec api node --import tsx infrastructure/scripts/reset-password.ts YOUR_EMAIL --confirm-reset`. This replaces the password and revokes that account's sessions and API keys. Keep the generated password private. Email-based account recovery is not implemented.

## Domains and operations

The platform needs a dashboard origin, API, worker, database and separate website origin. The latter needs its own public DNS/HTTPS routing; the viewer does not remove that requirement. Custom domains still require the returned ownership TXT record and successful verification. A verification record alone does not prove certificate issuance.

Monitoring reports actual service measurements and leaves unavailable metrics empty. GitHub-static deployments have no local website artifact to browse or download. Update their repository and deploy another version. Legacy file browsing and ZIP downloads apply only to retained static artifacts in legacy mode.

GitHub connectivity and rate limits affect the service. Private repositories, OAuth and automatic push deployments are not supported. Keep deployed commits accessible and monitor upstream failures.
