import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Check the public agency site against a disposable local dashboard, without changing its API data. */
export async function verifyAgencyLanding({ dashboardUrl, mockAdmin = false }) {
  const origin = new URL(dashboardUrl).origin;
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname), 'Landing QA requires a local isolated stack.');
  assert.notEqual(new URL(origin).port, '3100', 'Do not run browser fixtures against the user dashboard.');
  const repository = fileURLToPath(new URL('../../', import.meta.url));
  const screenshots = path.join(repository, 'tests', 'artifacts');
  await fs.mkdir(screenshots, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  if (mockAdmin) {
    // Explicit production-asset QA only: real integration runs keep these API calls untouched.
    await context.route(origin + '/api/v1/auth/setup', async route => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({ status: 200, json: { required: false } });
    });
    await context.route(origin + '/api/v1/auth/me', async route => {
      if (route.request().method() !== 'GET') return route.continue();
      await route.fulfill({ status: 401, json: { error: 'Authentication required' } });
    });
  }
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [], publicApiRequests = [], failedAssets = [];
  let publicPage = true;
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const url = new URL(request.url());
    if (publicPage && url.origin === origin && url.pathname.startsWith('/api/')) publicApiRequests.push(url.pathname);
  });
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin === origin && /\.(?:css|js)$/.test(url.pathname) && response.status() >= 400) failedAssets.push(`${response.status()} ${url.pathname}`);
  });

  const assertNoOverflow = async label => {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} horizontal overflow`);
  };
  const assertPublicPage = async () => {
    await page.locator('header').first().waitFor();
    const content = await page.locator('body').innerText();
    assert.match(content, /Websynk/i);
    assert.match(content, /Technologies/i);
    assert.match(await page.locator('#services').innerText(), /website|web development/i);
    assert.match(await page.locator('#services').innerText(), /app development|mobile apps/i);
    assert.match(await page.locator('#services').innerText(), /digital marketing/i);
    assert.equal(await page.locator('.sidebar, .auth-layout').count(), 0, 'The public page must not render the DeployHub workspace.');
    assert.doesNotMatch(await page.evaluate(() => document.querySelector('meta[name="robots"]')?.getAttribute('content') || ''), /noindex/i);
  };

  try {
    const response = await page.goto(origin);
    assert.equal(response.status(), 200, 'The public landing page should load successfully.');
    await assertPublicPage();
    const whatsappLinks = await page.locator('a[href^="https://wa.me/"]').evaluateAll(links => links.map(link => link.href));
    assert.ok(whatsappLinks.length >= 2, 'The landing page needs prominent and floating WhatsApp contact links.');
    for (const href of whatsappLinks) {
      const url = new URL(href);
      assert.equal(url.pathname, '/919115082252', 'WhatsApp links must connect to the supplied agency number.');
      assert.ok(url.searchParams.get('text')?.trim(), 'WhatsApp should include a useful enquiry message.');
    }
    const anchorTargets = await page.locator('a[href^="#"]').evaluateAll(links => links.map(link => link.getAttribute('href')).filter(href => href && href !== '#'));
    for (const href of anchorTargets) assert.ok(await page.locator(`[id="${href.slice(1)}"]`).count(), `Missing section target ${href}`);
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => ['A', 'BUTTON', 'SUMMARY'].includes(document.activeElement?.tagName)), 'The page should expose keyboard focusable navigation.');
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      scrollTo(0, 0);
    });
    await assertNoOverflow('Desktop');
    await page.screenshot({ path: path.join(screenshots, 'agency-desktop.png'), fullPage: true });
    await page.screenshot({ path: path.join(screenshots, 'agency-desktop-viewport.png') });

    await page.setViewportSize({ width: 768, height: 1024 });
    await assertNoOverflow('Tablet');
    await page.screenshot({ path: path.join(screenshots, 'agency-tablet.png'), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoOverflow('Mobile');
    const menu = page.locator('header button[aria-controls][aria-expanded]').first();
    assert.ok(await menu.isVisible(), 'The mobile menu control should be available.');
    assert.equal(await menu.getAttribute('aria-expanded'), 'false');
    await menu.click();
    await page.waitForFunction(() => document.querySelector('header button[aria-controls][aria-expanded]')?.getAttribute('aria-expanded') === 'true');
    const menuId = await menu.getAttribute('aria-controls');
    assert.match(menuId, /^[A-Za-z][A-Za-z0-9_-]*$/);
    await page.locator(`[id="${menuId}"] a[href="#services"]`).first().click();
    await page.waitForFunction(() => document.querySelector('header button[aria-controls][aria-expanded]')?.getAttribute('aria-expanded') === 'false');
    assert.equal(new URL(page.url()).hash, '#services');
    await page.evaluate(() => scrollTo(0, 0));
    await assertNoOverflow('Mobile menu');
    await page.screenshot({ path: path.join(screenshots, 'agency-mobile.png'), fullPage: true });
    await page.screenshot({ path: path.join(screenshots, 'agency-mobile-viewport.png') });
    assert.deepEqual(publicApiRequests, [], 'Public visitors should not depend on a DeployHub API connection.');

    publicPage = false;
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('header a[href="/admin"]').click();
    await page.waitForURL(origin + '/admin');
    await page.getByRole('heading', { name: 'Sign in to your workspace' }).waitFor();
    assert.match(await page.locator('meta[name="robots"]').getAttribute('content') || '', /noindex/i, 'The administration page should not be indexed.');
    await page.getByRole('link', { name: 'Back to website' }).click();
    await page.waitForURL(origin + '/');
    await assertPublicPage();
    await assertNoOverflow('Returned public page');
    await page.goto(origin + '/login');
    await page.waitForURL(origin + '/admin');
    await page.getByRole('heading', { name: 'Sign in to your workspace' }).waitFor();
    assert.deepEqual(failedAssets, [], 'Landing and admin styles/scripts should load successfully.');
    assert.deepEqual(errors, [], 'Landing and login navigation should not produce browser errors.');
    console.log('Landing browser checks passed: public services, supplied WhatsApp number, API independence, admin/login routes, return navigation, responsive layouts, mobile menu and assets.');
    if (mockAdmin) console.log('Admin initialization responses were mocked for production-asset QA; this run does not verify authentication or backend availability.');
  } catch (error) {
    await page.screenshot({ path: path.join(screenshots, 'agency-failure.png'), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyAgencyLanding({ dashboardUrl: process.env.E2E_ORIGIN || 'http://127.0.0.1:6200', mockAdmin: process.env.E2E_MOCK_ADMIN === '1' });
}
