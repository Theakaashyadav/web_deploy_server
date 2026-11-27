# Websynk landing page

This repository contains only the Websynk Technologies landing page. Services, company information, FAQs, enquiries, privacy and project terms are sections on `/`. Former service, company and blog URLs return 404. The former DeployHub platform is not part of the website.

The Next.js, React, TypeScript and CSS Modules setup, website artwork, favicon, social image, metadata, robots and sitemap are retained. The sitemap lists only https://websynk.in/.

## Run and verify

Use Node.js 22.18 or newer. Run `npm ci` and `npm run dev` from this repository. Local address: http://127.0.0.1:3100. The runner refuses occupied ports and protects the separate Avynex project on port 3000.

Run `npm run typecheck`, `npm test`, `npm run build` and `npm run test:integration`. After building, `npm run preview` serves the production build locally. Browser checks cover seven widths, the persistent contact controls, menu, enquiry validation and inline policies. Generated verification artifacts are ignored under tests/artifacts; no enquiry is sent.

## Hosting

Hostinger automatically deploys the GitHub main branch. Build: `npm run build`; output: `apps/dashboard/.next`; start command when needed: `npm start`. Production respects PORT and binds to 0.0.0.0; WEBSYNK_HOST can override it. The workspace path is retained for hosting compatibility.

The canonical origin is https://websynk.in. Set WEBSYNK_NOINDEX=true before building staging hosts; leave it false for production. Set GOOGLE_SITE_VERIFICATION only to a genuine owner-provided value. Google Tag Manager container GTM-P7S6T33L is installed; its account configuration is managed separately.

Call and WhatsApp links use +91 91150 82252. The form prepares a WhatsApp draft for the visitor to review and send, without storing an enquiry on the website. Fixed Call Now and WhatsApp controls remain visible while scrolling, with reduced-motion support.

No database, API, deployment worker or administrator is required. Git history retains the earlier implementation. Cleanup is scoped to this repository; the separate Avynex project is outside scope.
