# DeployHub development

This repository is DeployHub at `C:\Users\Theakaashyadav\Desktop\hosting`. The Avynex website at `C:\Users\Theakaashyadav\Desktop\Avynex` is a separate project. Keep their source, environment files, credentials, databases and preview processes independent. Do not import, copy, publish or modify Avynex as part of DeployHub maintenance unless the user explicitly requests work on Avynex. Scope filesystem changes to this repository and derive script paths from this repository's location.

Local DeployHub addresses are dashboard `http://localhost:3100`, API `http://localhost:4100`, and hosted websites on port `4101`. Avynex uses its own development server on port `3000`. Treat a port occupied by another project as a conflict; never reuse that process as DeployHub or stop it without authorization. Docker-internal service ports remain independent of these local development ports.

Build and verify the user's requested behavior. Run `npm run typecheck`, `npm test`, `npm run test:integration` and `npm run build` after relevant changes.

Static uploads must never execute source on the host. Build commands run only in restricted containers. Keep hosted website origins separate from the administrator origin. Preserve a working production deployment until its replacement has passed a health check. Never report `live` for a failed or unsupported build.

Use `deployhub deploy --preview` for requested previews. Production deployment requires explicit authorization; `--prod` represents that authorization. Return only verified URLs. Never print credentials, store plaintext API keys on the server, or commit secrets. Do not change VPS firewall, remove persistent data, or restore backups without explicit approval.

The reusable instructions for websites deployed through DeployHub live in `templates/AGENTS.md`.
