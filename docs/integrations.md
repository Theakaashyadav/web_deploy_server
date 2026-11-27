# CLI, REST and Codex integration

The primary workflow deploys ready static content from a **public GitHub repository**. DeployHub retains the pinned commit and deployment history while fetching website files from GitHub when requested.

## Build and authenticate

From the DeployHub repository:

```powershell
npm run build -w @deployhub/cli
npm run build -w @deployhub/mcp-server
npm link -w @deployhub/cli
deployhub login --url http://localhost:4100
```

Create a scoped dashboard API key. Existing projects need read/deploy access; creating a project also requires manage access. Restrict keys to a project and set expiration where appropriate. The server saves only the hash and shows the full key once.

Prefer secret-manager injection through `DEPLOYHUB_URL` and `DEPLOYHUB_TOKEN`. Remote API URLs require HTTPS; HTTP is accepted only for loopback development. The hidden login prompt can save a local credential file; it does not claim OS keychain protection. Do not commit credentials or put real keys in shared shell history.

## GitHub deployment

```powershell
deployhub deploy --project my-website --repository https://github.com/OWNER/REPOSITORY --directory docs --preview --json
# After explicit production authorization:
deployhub deploy --project my-website --repository https://github.com/OWNER/REPOSITORY --branch main --directory docs --prod --json
deployhub status DEPLOYMENT_ID --json
deployhub logs DEPLOYMENT_ID --follow
deployhub rollback DEPLOYMENT_ID --prod --json
```

Omit `--branch` for the repository default. The publish directory defaults to `.` and must contain usable `index.html` plus browser-ready assets. No source build runs in this mode. The worker pins a commit; a moving branch does not update an existing version.

Preview is the default. `--prod` explicitly authorizes production; it cannot be combined with `--preview`. Failed checks, API errors and timeouts return a nonzero exit code. The CLI returns a deployment URL only for a verified live result.

## REST endpoint

Send an authenticated JSON request to `POST /api/v1/projects/PROJECT_ID/github-deployments`:

```json
{
  "repository": "https://github.com/OWNER/REPOSITORY",
  "branch": "main",
  "directory": "docs",
  "environment": "preview"
}
```

For production set `environment: "production"` and `authorizeProduction: true` only after explicit authorization. Poll `GET /api/v1/deployments/DEPLOYMENT_ID` and inspect `GET /api/v1/deployments/DEPLOYMENT_ID/logs`. Publication/promotion and rollback require the existing production authorization field. Public viewer routing uses `GET /api/v1/public/sites/PROJECT_SLUG`, with optional `?deployment=DEPLOYMENT_ID` for a preview; this is routing metadata, not an authenticated management API.

## Local MCP bridge

Build the MCP workspace and run `apps/mcp-server/dist/index.js` as a local stdio server, forwarding `DEPLOYHUB_URL` and `DEPLOYHUB_TOKEN` from your secret manager. Its `deploy_github_site` tool deploys repository content through the same authenticated API. Status, logs, project listing and authorized promotion/rollback tools remain available.

Production actions require explicit user authorization and the corresponding production authorization fields. Tool errors must be handled as errors, not successful deployment results.

## Legacy local uploads

The previous `deployhub deploy --dir ...` packaging workflow and local-file MCP tools require the operator's explicit `DEPLOYMENT_MODE=legacy` setting. They are unavailable in the default GitHub-static mode. Legacy packaging rejects symlinks and excludes common credentials, dependencies and caches; website source builds run only in restricted Docker containers. Local-file MCP access additionally requires authorized roots through `DEPLOYHUB_ALLOWED_ROOTS`.

Legacy uploads retain source/artifacts and may require separate application storage. Their security, Docker, backup and production-network requirements remain described in the [security](SECURITY.md) and [runtime](RUNTIMES.md) guides. Switching modes does not authorize deletion of retained data.
