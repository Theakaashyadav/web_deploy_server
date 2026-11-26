import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

// Run against an isolated local stack, not a production administrator database.
const origin=process.env.E2E_ORIGIN || 'http://localhost:3100';
const browser=await chromium.launch({headless:true,executablePath:process.env.E2E_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const screenshots='tests/artifacts';await fs.mkdir(screenshots,{recursive:true});
try {
  if(process.env.E2E_RESET==='true') {
    assert.equal(origin,'http://localhost:3100');
    const db=new PrismaClient({datasourceUrl:'file:../../../data/browser/database.db'});
    await db.project.deleteMany();await db.user.deleteMany();await db.applicationSetting.deleteMany();await db.$disconnect();
  }
  await page.goto(origin);await page.getByRole('heading',{name:'Create your workspace'}).waitFor();
  await page.getByLabel('Full name',{exact:true}).fill('Local QA Administrator');
  await page.getByLabel('Email address',{exact:true}).fill('qa@example.test');
  await page.locator('input[name=password]').fill(randomBytes(24).toString('base64url'));
  await page.getByRole('button',{name:'Create administrator'}).click();
  await page.getByRole('heading',{name:'Workspace overview',exact:true}).waitFor();
  const response=await page.request.post(origin+'/api/v1/projects',{data:{name:'Browser QA Website'},headers:{Origin:origin}});
  assert.equal(response.status(),201);const project=await response.json();
  await page.locator('.nav-item').filter({hasText:'All Projects'}).click();
  await page.getByRole('button',{name:'Refresh',exact:true}).click().catch(()=>{});
  await page.getByRole('heading',{name:project.name,exact:true}).waitFor({timeout:15000});
  await page.getByRole('heading',{name:project.name,exact:true}).click();
  // The API is the data source; no seeded counters or fabricated deployed states.
  await page.getByRole('button',{name:'Deploy new version',exact:true}).click();
  await page.locator('input[type=file]').last().setInputFiles({name:'index.html',mimeType:'text/html',buffer:Buffer.from('<h1>Browser verified website</h1>')});
  await page.getByRole('button',{name:/deploy/i}).last().click();
  await page.getByText('live',{exact:true}).first().waitFor({timeout:20000});
  await page.getByRole('button',{name:'Close dialog',exact:true}).click().catch(()=>{});
  await page.locator('.nav-item').filter({hasText:'Overview'}).click();
  const projectCard=page.locator('.project-card').filter({hasText:project.name});
  await projectCard.locator('.status').filter({hasText:'preview'}).waitFor();
  assert.match(await projectCard.locator('.project-card-url').innerText(),/--dpl-/,'Preview-only project must show its verified preview URL');
  await page.screenshot({path:screenshots+'/overview-desktop.png',fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Desktop horizontal overflow');
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=0);
  assert.equal(await page.locator('.sidebar').isVisible(),false,'Mobile navigation is hidden until opened');
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().x===0);
  assert.equal(await page.locator('.sidebar').isVisible(),true,'Mobile menu opens navigation');
  await page.locator('.sidebar-scrim').click({position:{x:375,y:100}});
  await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=0);
  assert.equal(await page.locator('.sidebar').isVisible(),false,'Closing mobile navigation restores content');
  await page.screenshot({path:screenshots+'/overview-mobile.png',fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile horizontal overflow');
  await page.setViewportSize({width:768,height:1024});
  await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Tablet horizontal overflow');
  assert.deepEqual(errors,[]);
  console.log('Browser checks passed: setup, authenticated project, real file upload/live preview, correct preview-only project URL, desktop/tablet/mobile overflow, mobile drawer open/close, no page errors.');
} catch(error) {await page.screenshot({path:screenshots+'/failure.png',fullPage:true});throw error;}
finally {await browser.close();}
