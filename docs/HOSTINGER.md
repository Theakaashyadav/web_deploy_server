# Hostinger dashboard deployment

DeployHub is a monorepo. Its Next.js dashboard builds inside `apps/dashboard`, so the generated output is `apps/dashboard/.next` when paths are measured from the repository root.

The public `/` route is the Websynk Technologies agency homepage. Its WhatsApp link uses the owner's contact in `apps/dashboard/lib/agency.ts`. The admin icon opens `/admin`; `/login` redirects there. The public page renders without the deployment API. Keep `DASHBOARD_ORIGIN` set to the origin only, without `/admin`.

Use these settings in hPanel's **Settings & Redeploy** screen:

| Setting | Value |
| --- | --- |
| Framework | Next.js |
| Branch | `main` |
| Root directory | `.` |
| Node.js | `22.x`, minimum `22.18.0` |
| Package manager | npm |
| Build command | `npm run build -w @deployhub/dashboard` |
| Output directory | `apps/dashboard/.next` |
| Environment variable | `NODE_ENV=production` |
| Optional install override | `NPM_CONFIG_INCLUDE=dev` if the provider overrides or ignores the repository's npm configuration |

Set `API_ORIGIN` to the reachable DeployHub API address before building. The dashboard's API rewrites are generated during the build, so changing that value requires another build. A localhost API address works only when the backend is actually running and reachable from the dashboard's server; publishing this dashboard does not start that backend.

Save the updated settings, then redeploy. Changing source code or clicking redeploy without saving a corrected output directory leaves Hostinger searching the old path. Hostinger documents repository-root builds with a nested output directory in its [monorepo deployment guide](https://www.hostinger.com/support/how-to-deploy-monorepos-with-npm-yarn-or-pnpm-on-hostinger/).

## No output directory found after build

If the log says the build completed and then reports `No output directory found after build`, check its configured output directory. With the repository root set to `.`, `.next` points to a directory this build does not create. Use `apps/dashboard/.next`.

The existing root command `npm run build` also compiles the dashboard, along with the CLI and MCP server. It produces the same dashboard output path. Moving or copying only `.next` to the repository root is not a substitute for configuring the app's actual output: standalone server files, static assets and traced dependencies must stay in their expected layout.

## Missing Node.js types during the build

`TS2688: Cannot find type definition file for 'node'` means the build cannot find `@types/node`. With `NODE_ENV=production`, npm normally omits development dependencies. DeployHub's builds require those dependencies, including TypeScript, Node.js/React types and Tailwind/PostCSS. Selecting only the dashboard build still requires its build tools.

The repository's `.npmrc` sets `include=dev` so npm installs the build dependencies while keeping `NODE_ENV=production`. Redeploy the updated commit so dependency installation runs again. If the provider overrides or ignores that project configuration, add `NPM_CONFIG_INCLUDE=dev` in hPanel and save it before redeploying. No dependency version upgrade is needed for this error.

The npm upgrade notice and install-script approval warnings are separate from `TS2688`. Review any required lifecycle script individually; approving every script or upgrading npm is not required to restore the missing type definitions.

## Full DeployHub service

These settings publish the dashboard. The complete platform also requires the API, queue worker, website gateway, PostgreSQL, Redis, persistent storage and a Linux Docker daemon for source builds and application runtimes. Managed web hosting without Docker access cannot run that stack as configured in this repository. Install the full service on a Docker-capable VPS using [the VPS guide](VPS.md).

Verify dashboard publishing, its CSS/JavaScript assets and API responses separately. A successful frontend build does not establish that uploaded websites can be deployed. Public domains must also resolve to the configured hosting target before they can serve the application.
