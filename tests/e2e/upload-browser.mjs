import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Exercise a real folder picker against the caller's disposable stack and existing fixture account. */
export async function verifyFolderUpload({dashboardUrl,folder,projectId,productionUrl,email,password,expectedColor='rgb(18, 52, 86)'}) {
  const origin=new URL(dashboardUrl).origin;
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname),'Browser fixtures require a local isolated stack.');
  assert.notEqual(new URL(origin).port,'3100','Do not run browser fixtures against the user dashboard.');
  assert.ok(email && password,'The isolated fixture account is required.');
  const repository=fileURLToPath(new URL('../../',import.meta.url));
  const browser=await chromium.launch({headless:true,executablePath:process.env.E2E_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const context=await browser.newContext({viewport:{width:1280,height:960}});
  const page=await context.newPage();
  const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  try {
    await page.goto(origin);
    await page.getByRole('heading',{name:'Sign in to your workspace'}).waitFor();
    await page.getByLabel('Email address',{exact:true}).fill(email);
    await page.locator('input[name=password]').fill(password);
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.getByRole('heading',{name:'Workspace overview',exact:true}).waitFor();
    await page.locator('.nav-item').filter({hasText:'All Projects'}).click();
    await page.getByRole('button',{name:'Refresh',exact:true}).click();
    const host=new URL(productionUrl).host.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const card=page.locator('.project-card').filter({has:page.locator('.project-card-url').filter({hasText:new RegExp(`^${host}/?$`)})});
    await card.click();
    await page.getByRole('button',{name:'Deploy new version',exact:true}).click();
    await page.locator('input[type=file][webkitdirectory]').setInputFiles(folder);
    await page.getByText(/Folder structure preserved/).waitFor();
    const received=page.waitForResponse(response=>response.request().method()==='POST' && response.url().endsWith(`/projects/${projectId}/deployments`));
    await page.getByRole('button',{name:'Deploy preview',exact:true}).click();
    const response=await received;
    assert.equal(response.status(),202,`Folder upload returned HTTP ${response.status()}: ${(await response.text()).slice(0,500)}`);
    const deployment=await response.json();
    const dialog=page.getByRole('dialog',{name:'Deployment details',exact:true});
    await dialog.locator('.status.live').waitFor({timeout:45000});
    const preview=await dialog.locator('.verified-url a').getAttribute('href');assert.ok(preview);
    assert.match(await dialog.locator('.log-output').innerText(),/root|public|nested/i);
    const website=await context.newPage();await website.goto(preview);
    assert.equal(await website.evaluate(()=>window.browserNestedWorks),true,'The linked JavaScript must load after nested root selection.');
    assert.equal(await website.locator('h1').evaluate(element=>getComputedStyle(element).color),expectedColor,'The linked stylesheet must load after nested root selection.');
    assert.deepEqual(pageErrors,[]);
    await fs.mkdir(path.join(repository,'tests','artifacts'),{recursive:true});
    await page.screenshot({path:path.join(repository,'tests','artifacts','nested-folder-upload.png'),fullPage:true});
    return deployment.id;
  } catch(error) {
    await fs.mkdir(path.join(repository,'tests','artifacts'),{recursive:true});
    await page.screenshot({path:path.join(repository,'tests','artifacts','nested-folder-upload-failure.png'),fullPage:true}).catch(()=>{});
    throw error;
  } finally {await browser.close();}
}
