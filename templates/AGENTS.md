# Website development and DeployHub deployment

Complete the requested website work before deploying it. Inspect project instructions and existing conventions, run necessary tests and its build, fix failures, verify responsive layouts, links, and assets.

When deployment is requested, use the DeployHub CLI. Read `deployhub.json` and `.deployhubignore`. Never read, print, commit, upload, or include API keys, local credential files, private keys, or `.env` files in artifacts. Authenticate using the scoped `DEPLOYHUB_TOKEN` environment variable.

DeployHub defaults to public GitHub static sites. Use `deployhub deploy --repository https://github.com/OWNER/REPOSITORY --directory docs --preview --json`, with the actual repository URL and committed static-output directory. Omit `--branch` to use the repository default. The chosen directory must contain browser-ready `index.html` and assets. Build framework source in the project's own workflow and commit its static output before deploying; never execute uploaded source on the DeployHub host. DeployHub retains a pinned commit and metadata, while files remain on GitHub. A new commit requires a new deployment. Local folder/ZIP deployment requires the operator's explicit legacy mode.

Run `deployhub deploy --repository https://github.com/OWNER/REPOSITORY --project PROJECT --directory PUBLISH_DIRECTORY --preview --json` for a preview. Select the committed static output directory; omit `--branch` for the repository default. Production changes require explicit user authorization; after receiving it, use the same repository options with `--prod --json`. Do not infer authorization from website development work alone. Likewise, obtain explicit production authorization before rollback or promotion. A preview is safe to create when the user requested deployment but did not authorize production.

Wait for the CLI result. Use `deployhub status <deployment-id> --json` and `deployhub logs <deployment-id>` when troubleshooting. A zero exit code and `status: live` with a returned URL indicate that DeployHub verified the deployment. Never claim success for a queued, failed, cancelled, timed-out, or unverified deployment. Return the actual URL corresponding to the deployment environment. Never invent a public URL.

The local development domains ending in `.localhost` are accessible on the local computer. Public access requires a configured VPS, public DNS, and HTTPS.
