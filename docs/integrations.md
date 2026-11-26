# CLI, REST and Codex integration

DeployHub's CLI is the primary deployment integration. It packages files locally, uploads them to the authenticated API, polls persisted deployment status and logs, and returns a URL only after the server reports a health-checked deployment. It supports Windows, macOS and Linux with Node.js 22.18 or newer.

## Build and install

From the repository root after `npm install`:

```sh
npm run build --workspace @deployhub/cli
npm run build --workspace @deployhub/mcp-server
npm link --workspace @deployhub/cli
deployhub --help
```

Alternatively, invoke `node /absolute/path/to/deployhub/apps/cli/dist/index.js` directly. To create an installable tarball, run `npm pack --workspace @deployhub/cli` after building. Install the resulting tarball with `npm install -g <tarball>`. The package includes its runtime dependencies in its manifest; npm resolves them on installation.

## Authentication

Create a scoped key in **API Keys** in the dashboard. Deployment to a new project requires `manage` and `deploy`; an existing project can use a project-restricted key with `read` and `deploy`. Use `read` for polling and log access. Configure an expiration and revoke unused keys. The server shows each secret once and retains its hash.

PowerShell:

```powershell
$env:DEPLOYHUB_URL = 'http://localhost:4100'
$env:DEPLOYHUB_TOKEN = '<scoped-api-key>'
deployhub projects --json
```

POSIX shells:

```sh
export DEPLOYHUB_URL='https://deployhub.your-admin-domain.com'
export DEPLOYHUB_TOKEN='<scoped-api-key>'
deployhub projects --json
```

Avoid saving real keys in shell history. Use your editor's secret injection or enter a key through `deployhub login`'s hidden prompt. It validates the key and stores it under `~/.deployhub/credentials.json` with mode `0600` on POSIX. Windows does not implement POSIX file modes as an ACL policy; use environment injection or secure the directory with your account's ACL. The CLI does not claim OS keychain protection. Remote API URLs require HTTPS; plain HTTP is permitted only for loopback development. Saved credentials are removed by `deployhub logout`, which does not revoke the key on the server.

## Deploy a project

```sh
cd /path/to/website
deployhub init --project my-website
deployhub deploy --preview --json
# Only after explicit production authorization:
deployhub deploy --prod --json
deployhub deploy --dir ./dist --project my-website --preview --json
deployhub status <deployment-id> --json
deployhub logs <deployment-id> --follow
deployhub projects --json
deployhub rollback <retained-deployment-id> --prod --json
deployhub open --project my-website
deployhub logout
```

Preview remains the default even if `deployhub.json` specifies `environment: production`. The `--prod` flag is required for production changes. `--preview` and `--prod` cannot be combined. Failed builds, missing verified URLs, API errors and timeouts return a nonzero exit code. `--json` produces machine-readable output without progress messages or secret values. Cancelling the CLI interrupts local work; an already queued server job may continue and can be cancelled in the dashboard.

Example configuration:

```json
{
  "project": "my-website",
  "framework": "auto",
  "rootDirectory": ".",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "environment": "preview",
  "autoDetect": true
}
```

`rootDirectory` is relative to the uploaded project and controls server-side detection/building. Omit install/build/output settings to use the server framework preset. Static HTML needs no build. Source builds require the configured Docker worker; the CLI never executes website build commands on your computer.

`.deployhubignore` uses gitignore-style patterns:

```gitignore
tests/
*.map
notes/
```

Mandatory exclusions cannot be overridden: dependency directories, VCS data, caches, `.env` and `.env.*`, `.ssh`, `.aws`, `.azure`, `.gcloud`, credential files, npm credentials, private key formats, and temporary files. Symbolic links and special files are rejected. The packager limits uploads to 10,000 files and 250 MiB uncompressed. Ignore patterns help minimize artifacts; secrets with arbitrary names require deliberate project hygiene. Never put secrets in client assets.

## Local MCP bridge

MCP is optional. A remote server cannot inspect files on your computer. This bridge runs locally, performs canonical path checks and sends uploads using the same CLI client and packager. File operations are denied unless the folder is explicitly authorized.

Codex `config.toml` example (replace paths; do not commit real tokens):

```toml
[mcp_servers.deployhub]
command = "node"
args = ["C:/path/to/deployhub/apps/mcp-server/dist/index.js"]
env_vars = ["DEPLOYHUB_URL", "DEPLOYHUB_TOKEN", "DEPLOYHUB_ALLOWED_ROOTS"]
startup_timeout_sec = 20
tool_timeout_sec = 960
```

Codex supports local stdio `command`, `args`, forwarded `env_vars`, and tool timeouts in this format. The longer timeout lets the bridge wait for a deployment's build and health check. See the [official Codex MCP configuration documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

Set `DEPLOYHUB_ALLOWED_ROOTS` to absolute project directories separated by the OS path delimiter: semicolon on Windows, colon on Linux/macOS. Authorize individual website folders rather than your whole home directory. For example, PowerShell `$env:DEPLOYHUB_ALLOWED_ROOTS = 'C:\Projects\website-a;C:\Projects\website-b'`. The bridge resolves symlinks/junctions before containment checks. Folder packaging rejects symlinks. Do not authorize untrusted writable roots shared with other users.

The stdio server exposes:

| Tool | Purpose |
| --- | --- |
| `create_project` | Create project metadata |
| `list_projects` | List allowed projects |
| `deploy_website` | Upload a local ZIP under an authorized root |
| `deploy_local_folder` | Package and deploy an authorized directory |
| `get_deployment_status` | Read persisted status |
| `get_deployment_logs` | Read actual logs |
| `get_website_url` | Read generated URL and active deployment marker |
| `update_website` | Deploy a new version to an existing project |
| `promote_deployment` | Promote a retained artifact after authorization |
| `rollback_deployment` | Switch to a retained artifact after authorization |
| `connect_custom_domain` | Request DNS ownership verification instructions |
| `get_server_status` | Read server metrics |

Set both `production: true` and `authorizeProduction: true` only after the user has explicitly authorized a production upload. Promotion and rollback require `authorizeProduction: true`. MCP annotations identify production actions as potentially destructive. Tool errors are returned with `isError: true`; they are never disguised as successful deployment results.

Copy [the reusable website instructions](../templates/AGENTS.md) and [configuration](../templates/deployhub.json) into future projects. The CLI remains usable when an editor does not support MCP.

## Direct REST upload

Use a scoped bearer token and a unique idempotency key. Example commands use placeholders:

```sh
curl -f -H "Authorization: Bearer $DEPLOYHUB_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"my-website","framework":"auto"}' \
  "$DEPLOYHUB_URL/api/v1/projects"

curl -f -H "Authorization: Bearer $DEPLOYHUB_TOKEN" \
  -H 'Idempotency-Key: <unique-request-id>' \
  -F archive=@website.zip -F environment=preview \
  "$DEPLOYHUB_URL/api/v1/projects/<project-id>/deployments"

curl -f -H "Authorization: Bearer $DEPLOYHUB_TOKEN" \
  "$DEPLOYHUB_URL/api/v1/deployments/<deployment-id>"
```

For authorized production uploads also send `-F environment=production -F authorizeProduction=true`. A successful upload response can be `queued`; poll deployment status and read `logs` until `live`, `failed`, or `cancelled`. A generated production URL does not mean a project is serving: its `currentDeploymentId` must point to an active verified artifact.
