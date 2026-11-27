# DeployHub

DeployHub connects **public GitHub repositories containing ready static websites** to a versioned deployment dashboard. Paste a repository link, select its branch and publish directory, and deploy a checked version.

- DeployHub saves repository settings, a pinned commit and logs. It does **not** clone repositories or keep website files in uploads, workspaces or artifact storage.
- Files are fetched from GitHub at that immutable commit when visitors request them. New commits appear only after a new deployment.
- Each project address, such as `/admin/projectname`, opens an isolated viewer. The actual website runs on a separate configured hosting origin, keeping project JavaScript apart from administrator cookies and pages.
- Previews leave production unchanged. Publication, promotion and rollback require explicit production authorization. A failed check preserves the working production version.

The publish directory must contain a usable `index.html` and browser-ready assets. Plain HTML/CSS/JavaScript works directly. For React, Vite, Vue, Astro or another generator, build in your own GitHub workflow and commit the static output, then select that output directory. Server applications, source JSX/TypeScript entries, build commands and file uploads are disabled in the default GitHub-static mode. GitHub OAuth, private repositories and automatic push/webhook deployment are not implemented.

GitHub remains the content source: its availability and request limits affect serving. This mode is not an offline mirror or a CDN. Keep your repository and deployed commits accessible; rollback requires the selected commit to remain available.

## Local setup

DeployHub lives in `C:\Users\Theakaashyadav\Desktop\hosting`. Avynex is a separate project at `C:\Users\Theakaashyadav\Desktop\Avynex`; its source, secrets, data and port `3000` are independent.

| Local service | Address |
| --- | --- |
| Public Websynk website | `http://localhost:3100` |
| DeployHub dashboard | `http://localhost:3100/admin` |
| DeployHub API | `http://localhost:4100` |
| Separate website runtime | `http://<project-slug>.localhost:4101` |

Requirements: Node.js 22.18 or newer and npm. GitHub-static hosting needs outbound HTTPS access to GitHub; Docker is not needed to build or execute website content.

```powershell
npm ci
npm run setup
npm run build -w @deployhub/cli
npm run build -w @deployhub/mcp-server
npm run dev
```

Create the first administrator at `http://localhost:3100/admin`. There are no default credentials. Keep `DASHBOARD_ORIGIN` as an origin without a path. The local runner refuses occupied DeployHub ports and starts independent dashboard, API, worker and gateway processes. All services must share the same database and absolute `DATA_DIR`.

## Deploy from GitHub

Create a project in the dashboard, connect a public repository and select **Preview**. When its checks pass, review the returned preview. Publish only with explicit production authorization. Website navigation runs inside the isolated viewer; the parent project address remains the viewer entry.

The CLI supports the same workflow:

```powershell
deployhub login --url http://localhost:4100
deployhub deploy --project my-website --repository https://github.com/OWNER/REPOSITORY --directory docs --preview
# After explicit production authorization:
deployhub deploy --project my-website --repository https://github.com/OWNER/REPOSITORY --directory docs --prod
```

A branch can be selected with `--branch`; omit it for the repository default. Create a scoped API key in the dashboard for CLI login. Prefer secret-manager injection with `DEPLOYHUB_TOKEN`, and never commit keys.

## Verify

```powershell
npm run typecheck
npm test
npm run test:integration
npm run build
```

GitHub integration tests use controlled upstream responses with real local API, worker and gateway processes. They do not create a public deployment or certify live GitHub availability. Legacy integration cases explicitly enable legacy mode.

## Existing deployments and infrastructure

`DEPLOYMENT_MODE=github-static` is the default. Existing files and application volumes are retained. Operators who deliberately need the previous upload/build API can set `DEPLOYMENT_MODE=legacy`; its Docker prerequisites, retained-file storage and network boundaries still apply. Do not remove legacy data merely because new GitHub deployments need no website storage.

The full platform still needs its API, database, worker and separate website gateway. A successful dashboard-only build on managed hosting does not supply those services. Public use additionally needs DNS and HTTPS routing for the administrator and separate hosting domains. See the [VPS guide](docs/VPS.md) and [Hostinger settings](docs/HOSTINGER.md). No production deployment is implied by these instructions.

Further documentation: [administrator manual](docs/ADMIN.md), [architecture](docs/ARCHITECTURE.md), [security boundaries](docs/SECURITY.md), [feature status](docs/STATUS.md), [CLI/API/MCP](docs/integrations.md), [legacy runtimes](docs/RUNTIMES.md), and [API specification](docs/openapi.json).
