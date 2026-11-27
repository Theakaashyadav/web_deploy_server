# Hostinger configuration for Websynk

This repository now contains the public Websynk website only. It does not need the former deployment API, database, Redis, Docker worker or administrator backend.

| Setting | Value |
| --- | --- |
| Framework | Next.js |
| Node.js | 22.x, minimum 22.18.0 |
| Root directory | `.` |
| Build command | `npm run build` |
| Output directory | `apps/dashboard/.next` |
| Start command, if required | `npm start` |
| Package manager | npm |
| Production mode | `NODE_ENV=production` |

Use the provider's Next.js framework detection, or set its start command to `npm start` when requested. The production launcher uses the provider's `PORT`, including 3000, and defaults to 3100 if no port is supplied. It binds to `0.0.0.0`; `WEBSYNK_HOST` can override that address. `npm run start -w @websynk/site` uses the same launcher. Use `npm run preview` for local loopback previews, where the separate project's port remains protected. The repository workspace is named `@websynk/site`; previous `@deployhub/dashboard` build overrides must be replaced.

The root `.npmrc` includes development dependencies because TypeScript and framework types are required at build time. If the provider overrides that setting, save `NPM_CONFIG_INCLUDE=dev` before installing/building. Do not point the build to the repository-root `.next`; the website builds inside `apps/dashboard`.

Configure `websynk.in` as the primary domain with valid HTTPS, redirect `www.websynk.in` to the primary hostname, and route unknown paths to the Next server so they return real 404 responses. Next also contains a hostname redirect. Canonical and sitemap URLs use HTTPS and trailing slashes.

Production: leave `WEBSYNK_NOINDEX=false`. Preview/staging: set it to true before building to emit noindex and a disallow-all robots policy. Google Search Console verification can be supplied using the real `GOOGLE_SITE_VERIFICATION` value before building. No analytics IDs or verification codes are fabricated.

Before publishing, verify `/`, a service page, `/robots.txt`, `/sitemap.xml`, `/opengraph-image.png` and a deliberately unknown URL. Former `/admin/`, `/login/` and `/api/` routes should be 404. Test the contact links without sending a message automatically.

Local implementation and local tests do not verify the live Hostinger deployment. Publishing requires explicit owner authorization; after publication run Google Rich Results Test, Schema Markup Validator and Search Console URL Inspection against the live URL and submit its sitemap.
