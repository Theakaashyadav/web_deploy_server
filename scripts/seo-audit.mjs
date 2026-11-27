import fs from 'node:fs/promises';
import path from 'node:path';
import {startBuiltSite,repository} from '../tests/helpers/site-server.mjs';
import {verifyAgencyLanding} from '../tests/e2e/landing-browser.mjs';
const site=await startBuiltSite();
try{const result=await verifyAgencyLanding({dashboardUrl:site.origin});await fs.writeFile(path.join(repository,'docs/seo-browser-results.json'),JSON.stringify(result,null,2)+'\n');console.log('SEO browser audit passed. Evidence: docs/seo-browser-results.json and tests/artifacts/seo-home-*.png');}
finally{await site.stop();}
