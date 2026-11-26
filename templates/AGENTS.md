# Website development and DeployHub deployment

Complete the requested website work before deploying it. Inspect project instructions and existing conventions, run necessary tests and its build, fix failures, verify responsive layouts, links, and assets.

When deployment is requested, use the DeployHub CLI. Read `deployhub.json` and `.deployhubignore`. Never read, print, commit, upload, or include API keys, local credential files, private keys, or `.env` files in artifacts. Authenticate using the scoped `DEPLOYHUB_TOKEN` environment variable.

Run `deployhub deploy --preview --json` for a preview. Production changes require explicit user authorization; after receiving it, use `deployhub deploy --prod --json`. Do not infer authorization from website development work alone. Likewise, obtain explicit production authorization before rollback or promotion. A preview is safe to create when the user requested deployment but did not authorize production.

Wait for the CLI result. Use `deployhub status <deployment-id> --json` and `deployhub logs <deployment-id>` when troubleshooting. A zero exit code and `status: live` with a returned URL indicate that DeployHub verified the deployment. Never claim success for a queued, failed, cancelled, timed-out, or unverified deployment. Return the actual URL corresponding to the deployment environment. Never invent a public URL.

The local development domains ending in `.localhost` are accessible on the local computer. Public access requires a configured VPS, public DNS, and HTTPS.
