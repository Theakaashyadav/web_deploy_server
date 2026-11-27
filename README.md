# Websynk Technologies website

The standalone Websynk website for website development, digital marketing and related services in Greater Noida and Noida. Built with Next.js App Router, React, TypeScript and CSS Modules. The existing public visual identity is retained. There is no DeployHub administrator panel, deployment API, worker, database dependency or project-hosting gateway.

## Run locally

Use Node.js 22.18 or newer and run commands from this repository:

```powershell
npm ci
npm run dev
```

Default local address: `http://localhost:3100`. The runner refuses an occupied port. Choose a different available `PORT` when necessary. Port 3000 belongs to the separate Avynex project; this repository does not read or modify that project.

## Verification

```powershell
npm run typecheck
npm test
npm run build
npm run test:integration
```

The integration command checks the built website and responsive browser behavior using a disposable local port, without sending enquiries or requiring a backend. After building, `npm run preview` serves the production build on local loopback with the same occupied-port and separate-project safeguards as development. Chrome can be selected through `E2E_CHROME` if the default local executable is unavailable.

## Hosting

Build command: `npm run build`. Repository-relative output: `apps/dashboard/.next`. The public site does not require database credentials or `API_ORIGIN`. See [Hostinger configuration](docs/HOSTINGER.md).

`npm start` starts the built website for hosting. It respects the provider's `PORT` (including 3000), defaults to 3100, and binds to `0.0.0.0` so the hosting proxy can reach it. Set `WEBSYNK_HOST` to override the bind address. Use `npm run preview` for a local preview instead.

The canonical production origin is `https://websynk.in`; non-WWW URLs use trailing slashes. Configure HTTPS and the www-to-non-www redirect at the hosting provider as well. `WEBSYNK_NOINDEX=true` is available for staging environments; leave it false for production. Set `GOOGLE_SITE_VERIFICATION` only to the actual Search Console value supplied by the owner. No Google Business Profile URL is fabricated.

The owner-provided Google Tag Manager container `GTM-P7S6T33L` is installed. Its published tags determine tracking behavior; GA4 and Google Ads account configurations have not been verified. No duplicate direct GA4 script is added, and enquiry personal information is not intentionally pushed to the data layer.

The enquiry form creates a WhatsApp draft for the visitor to review and send. It does not store enquiries in a website database or claim that a message was delivered. Telephone and Maps links use the business information supplied and confirmed by the owner.

The prior platform source is recoverable from local Git branch `backup/pre-standalone-seo-20261127`. Ignored historical data, credentials and local caches are untouched and are not part of the website build. No production deployment is performed automatically.

See [the SEO implementation report](SEO-IMPLEMENTATION-REPORT.md) for implemented changes, evidence, keyword mapping and remaining account-dependent actions.
