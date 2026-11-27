import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { pathToFileURL } from 'node:url';

test('GitHub static platform: pinned commits, isolated routing and metadata-only storage', { timeout: 180000 }, async t => {
  const tag = randomBytes(6).toString('hex');
  const directory = path.resolve('data', `integration-github-${tag}`);
  const dataRoot = path.resolve('data');
  assert.equal(path.dirname(directory), dataRoot);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'database.db'), '', { flag: 'wx', mode: 0o600 });
  const databaseUrl = `file:../../../data/integration-github-${tag}/database.db`;
  const firstCommit = 'a'.repeat(40), secondCommit = 'b'.repeat(40);
  const missingCommit = 'c'.repeat(40), sourceCommit = 'd'.repeat(40), assetCommit = 'e'.repeat(40);
  let currentCommit = firstCommit, unavailable = false;
  const upstreamRequests: { pathname: string; authorization?: string; cookie?: string }[] = [];
  const upstream = http.createServer((incoming, response) => {
    const pathname = new URL(incoming.url!, 'http://fixture.invalid').pathname;
    upstreamRequests.push({ pathname, authorization: incoming.headers.authorization, cookie: incoming.headers.cookie });
    response.setHeader('Content-Type', 'application/json');
    if (pathname === '/api/repos/fixture/website') return response.end(JSON.stringify({ private: false, default_branch: 'main' }));
    if (pathname.startsWith('/api/repos/fixture/website/commits/')) {
      const branch = decodeURIComponent(pathname.slice('/api/repos/fixture/website/commits/'.length));
      const commit = branch === 'broken' ? missingCommit : branch === 'source' ? sourceCommit : branch === 'missing-asset' ? assetCommit : currentCommit;
      return response.end(JSON.stringify({ sha: commit }));
    }
    if (pathname.startsWith('/raw/fixture/website/')) {
      if (unavailable) { response.statusCode = 503; return response.end('GitHub fixture unavailable'); }
      const [commit, ...parts] = pathname.slice('/raw/fixture/website/'.length).split('/');
      const filename = parts.join('/');
      if (filename === 'docs/index.html' && commit !== missingCommit) {
        response.setHeader('Content-Type', 'text/plain');
        if (commit === sourceCommit) return response.end('<!doctype html><div id="root"></div><script type="module" src="/src/main.tsx"></script>');
        const script = commit === assetCommit ? '/assets/missing.js' : '/assets/app.js';
        return response.end(`<!doctype html><html><head><link rel="stylesheet" href="/assets/site.css"></head><body><h1>GitHub ${commit === firstCommit ? 'version one' : 'version two'}</h1><script src="${script}"></script></body></html>`);
      }
      if (filename === 'docs/assets/site.css') return response.end('body{color:rgb(10,20,30)}');
      if (filename === 'docs/assets/app.js') return response.end('window.githubStaticReady=true;');
      if (filename === 'docs/about/index.html') return response.end('<!doctype html><h1>Nested GitHub page</h1>');
    }
    response.statusCode = 404; response.end('Not found');
  });
  await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamPort = (upstream.address() as AddressInfo).port;
  async function freePort() {
    const server = http.createServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    return port;
  }
  const apiPort = await freePort(), runtimePort = await freePort(), dashboardPort = await freePort();
  const apiOrigin = `http://127.0.0.1:${apiPort}`;
  const dashboardOrigin = `http://127.0.0.1:${dashboardPort}`;
  const preload = path.join(directory, 'github-fixture.mjs');
  await fs.writeFile(preload, `const originalFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>{
 const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
 const prefix=url.hostname==='api.github.com'?'api':url.hostname==='raw.githubusercontent.com'?'raw':null;
 return originalFetch(prefix?'http://127.0.0.1:${upstreamPort}/'+prefix+url.pathname+url.search:input,init);
};
`);
  const env = { ...process.env, NODE_ENV: 'test', DEPLOYMENT_MODE: '', DATABASE_URL: databaseUrl, DATA_DIR: directory,
    API_PORT: String(apiPort), RUNTIME_PORT: String(runtimePort), SITE_DOMAIN: 'localhost', SITE_PROTOCOL: 'http',
    SITE_PORT: String(runtimePort), DASHBOARD_ORIGIN: dashboardOrigin, BUILD_DOCKER_ENABLED: 'false', RUNTIME_DOCKER_ENABLED: 'false',
    REDIS_URL: '', SETUP_TOKEN: '', ENCRYPTION_KEY: 'cd'.repeat(32),
    PRISMA_SCHEMA_ENGINE_BINARY: path.resolve(`node_modules/@prisma/engines/schema-engine-${process.platform === 'win32' ? 'windows.exe' : 'debian-openssl-3.0.x'}`),
  };
  let output = '';
  const processes: ChildProcess[] = [];
  function start(file: string) {
    const child = spawn(process.execPath, ['--import', 'tsx', '--import', pathToFileURL(preload).href, file], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout!.on('data', data => { output += data; });
    child.stderr!.on('data', data => { output += data; });
    processes.push(child); return child;
  }
  async function command(args: string[], extraEnv: Record<string, string> = {}) {
    return new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, args, { env: { ...env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
      child.on('error', reject);
      child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(`Command failed (${code}): ${stderr}\n${stdout}`)));
    });
  }
  async function stop(child: ChildProcess) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>(resolve => {
      const timer = setTimeout(resolve, 3000);
      child.once('exit', () => { clearTimeout(timer); resolve(); }); child.kill();
    });
  }
  t.after(async () => {
    await Promise.all(processes.map(stop));
    await new Promise<void>(resolve => { upstream.close(() => resolve()); upstream.closeAllConnections(); });
    assert.equal(path.dirname(path.resolve(directory)), dataRoot);
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });
  await command(['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate', '--schema', 'packages/database/prisma/schema.local.prisma']);
  start('apps/api/src/index.ts'); start('apps/worker/src/runtime.ts'); start('apps/worker/src/index.ts');
  async function ready(url: string) {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (await fetch(url).then(response => response.ok, () => false)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Service did not start: ${url}\n${output}`);
  }
  await Promise.all([ready(apiOrigin + '/healthz'), ready(`http://127.0.0.1:${runtimePort}/healthz`)]);
  let token = '';
  async function request(endpoint: string, body?: unknown, method?: string, useToken = token) {
    const response = await fetch(apiOrigin + '/api/v1' + endpoint, {
      method: method || (body === undefined ? 'GET' : 'POST'),
      headers: { ...(useToken ? { Authorization: `Bearer ${useToken}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() as any };
  }
  async function site(hostname: string, pathname = '/', method = 'GET') {
    return new Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
      const incoming = http.request({ hostname: '127.0.0.1', port: runtimePort, path: pathname, method,
        headers: { Host: `${hostname}.localhost:${runtimePort}`, Authorization: 'Bearer must-not-reach-github', Cookie: 'deployhub_session=must-not-reach-github' } }, response => {
        let body = ''; response.setEncoding('utf8');
        response.on('data', chunk => { body += chunk; });
        response.on('end', () => resolve({ status: response.statusCode!, body, headers: response.headers }));
      });
      incoming.on('error', reject); incoming.end();
    });
  }
  async function waitForDeployment(id: string) {
    for (let attempt = 0; attempt < 120; attempt++) {
      const state = (await request('/deployments/' + id)).data;
      if (['live', 'failed', 'cancelled'].includes(state.status)) return state;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw new Error('GitHub deployment timed out\n' + output);
  }
  let project: any, preview: any, first: any, second: any;
  async function deploy(overrides: Record<string, unknown> = {}) {
    const result = await request(`/projects/${project.id}/github-deployments`, {
      repository: 'https://github.com/fixture/website', directory: 'docs', environment: 'preview', ...overrides,
    });
    assert.equal(result.status, 202, JSON.stringify(result.data));
    return waitForDeployment(result.data.id);
  }
  await t.test('default mode rejects uploads and exposes GitHub capability', async () => {
    const setup = await request('/auth/setup', { name: 'GitHub integration', email: 'github@example.test', password: 'A-test-password-!2026' });
    assert.equal(setup.status, 201); token = setup.data.token;
    project = (await request('/projects', { name: 'GitHub Website' })).data;
    assert.equal(project.productionUrl, dashboardOrigin + '/admin/' + project.slug);
    const capabilities = (await request('/capabilities')).data;
    assert.equal(capabilities.deploymentMode, 'github-static');
    assert.equal(capabilities.staticUploadsAvailable, false);
    assert.equal(capabilities.sourceBuildsAvailable, false);
    assert.equal(capabilities.dynamicRuntimeAvailable, false);
    assert.equal((await request(`/projects/${project.id}/deployments`, {})).status, 410);
    assert.equal((await request(`/public/sites/${project.slug}`, undefined, undefined, '')).status, 404);
  });
  await t.test('preview pins the default branch and serves correct static MIME types', async () => {
    preview = await deploy(); assert.equal(preview.status, 'live', JSON.stringify(preview));
    const github = JSON.parse(preview.configuration).github;
    assert.equal(github.commit, firstCommit); assert.equal(github.branch, 'main'); assert.equal(github.directory, 'docs');
    assert.equal(preview.source, 'github'); assert.equal(preview.uploadPath, '');
    assert.equal(preview.artifact.kind, 'github-static'); assert.equal(preview.artifact.path, '');
    assert.equal(String(preview.artifact.sizeBytes), '0');
    assert.equal((await request('/projects/' + project.id)).data.currentDeploymentId, null);
    const resolver = await request(`/public/sites/${project.slug}?deployment=${preview.id}`, undefined, undefined, '');
    assert.equal(resolver.status, 200); assert.equal(resolver.data.deploymentId, preview.id);
    assert.match(resolver.data.url, new RegExp(`^http://${project.slug}--${preview.id}\\.localhost:${runtimePort}/?$`));
    assert.match((await site(`${project.slug}--${preview.id}`)).body, /GitHub version one/);
    const css = await site(`${project.slug}--${preview.id}`, '/assets/site.css');
    assert.equal(css.status, 200); assert.match(String(css.headers['content-type']), /^text\/css/);
    const js = await site(`${project.slug}--${preview.id}`, '/assets/app.js');
    assert.equal(js.status, 200); assert.match(String(js.headers['content-type']), /javascript/);
    assert.match((await site(`${project.slug}--${preview.id}`, '/about/')).body, /Nested GitHub page/);
    const directoryRedirect = await site(`${project.slug}--${preview.id}`, '/about');
    assert.equal(directoryRedirect.status, 308); assert.equal(directoryRedirect.headers.location, '/about/');
    assert.equal((await site(`${project.slug}--${preview.id}`, '/', 'POST')).status, 405);
    assert.equal((await site(`${project.slug}--${preview.id}`, '/.env')).status, 404);
    assert.equal((await site(`${project.slug}--${preview.id}`, '/%2eenv')).status, 404);
    const unsafeRedirect = await site(`${project.slug}--${preview.id}`, '//evil.example');
    assert.equal(unsafeRedirect.status, 404); assert.equal(unsafeRedirect.headers.location, undefined);
    assert.equal((await site(`${project.slug}--${preview.id}`, '/package.json')).status, 404);
    assert.equal((await site(`${project.slug}--${preview.id}`, '/src/main.tsx')).status, 404);
  });
  await t.test('publication is explicit; updates remain pinned and rollback preserves URL', async () => {
    assert.equal((await request(`/projects/${project.id}/github-deployments`, {
      repository: 'https://github.com/fixture/website', directory: 'docs', environment: 'production',
    })).status, 400);
    assert.equal((await request(`/deployments/${preview.id}/promote`, {})).status, 400);
    assert.equal((await request(`/deployments/${preview.id}/promote`, { authorizeProduction: true })).status, 200);
    first = preview;
    const resolver = await request('/public/sites/' + project.slug, undefined, undefined, '');
    assert.equal(resolver.status, 200); assert.equal(resolver.data.deploymentId, first.id);
    assert.equal(new URL(resolver.data.url).host, `${project.slug}.localhost:${runtimePort}`);
    currentCommit = secondCommit;
    assert.match((await site(project.slug)).body, /version one/);
    second = await deploy({ environment: 'production', authorizeProduction: true });
    assert.equal(second.status, 'live', JSON.stringify(second));
    assert.equal(second.productionUrl, first.productionUrl);
    assert.match((await site(project.slug)).body, /version two/);
    assert.equal((await request(`/deployments/${first.id}/rollback`, { authorizeProduction: true })).status, 200);
    assert.match((await site(project.slug)).body, /version one/);
  });
  await t.test('invalid static candidates and failed health checks cannot replace production', async () => {
    for (const branch of ['broken', 'source', 'missing-asset']) {
      const candidate = await deploy({ branch, environment: 'production', authorizeProduction: true });
      assert.equal(candidate.status, 'failed', JSON.stringify(candidate));
      assert.equal((await request('/projects/' + project.id)).data.currentDeploymentId, first.id);
      assert.equal((await request(`/public/sites/${project.slug}?deployment=${candidate.id}`, undefined, undefined, '')).status, 404);
      assert.match((await site(project.slug)).body, /version one/);
    }
    unavailable = true;
    assert.equal((await site(project.slug)).status, 503);
    assert.ok((await request(`/deployments/${second.id}/rollback`, { authorizeProduction: true })).status >= 400);
    unavailable = false;
    assert.equal((await request('/projects/' + project.id)).data.currentDeploymentId, first.id);
    assert.match((await site(project.slug)).body, /version one/);
  });
  await t.test('scope, repository validation and project state restrict GitHub deployment access', async () => {
    const reader = (await request('/api-keys', { name: 'GitHub reader', scopes: ['read'], projectId: project.id })).data;
    assert.equal((await request(`/projects/${project.id}/github-deployments`, {
      repository: 'https://github.com/fixture/website',
    }, undefined, reader.token)).status, 403);
    for (const repository of ['http://github.com/fixture/website', 'https://example.com/fixture/website', 'https://github.com/fixture/website/tree/main', 'https://user:secret@github.com/fixture/website']) {
      assert.equal((await request(`/projects/${project.id}/github-deployments`, { repository })).status, 400);
    }
    assert.equal((await request(`/projects/${project.id}/github-deployments`, {
      repository: 'https://github.com/fixture/website', directory: '../other',
    })).status, 400);
    const other = (await request('/projects', { name: 'Other GitHub Website' })).data;
    assert.equal((await request(`/public/sites/${other.slug}?deployment=${first.id}`, undefined, undefined, '')).status, 404);
    assert.equal((await request('/projects/' + project.id, { status: 'disabled' }, 'PATCH')).status, 200);
    assert.equal((await site(project.slug)).status, 404);
    assert.equal((await request('/public/sites/' + project.slug, undefined, undefined, '')).status, 404);
    assert.equal((await request('/projects/' + project.id, { status: 'active' }, 'PATCH')).status, 200);
    assert.equal((await site(project.slug)).status, 200);
    assert.equal((await request('/projects/' + project.id, { spaFallback: true }, 'PATCH')).status, 200);
    const route = await site(project.slug, '/client/route');
    assert.equal(route.status, 308);
    assert.match((await site(project.slug, String(route.headers.location))).body, /version one/);
    assert.equal((await site(project.slug, '/assets/missing.css')).status, 404);
  });
  await t.test('CLI uses GitHub without packaging and no website files are persisted', async () => {
    const stdout = await command(['--import', 'tsx', 'apps/cli/src/index.ts', 'deploy', '--project', project.slug,
      '--repository', 'https://github.com/fixture/website', '--directory', 'docs', '--preview', '--json'],
      { DEPLOYHUB_URL: apiOrigin, DEPLOYHUB_TOKEN: token });
    const deployment = JSON.parse(stdout); assert.equal(deployment.status, 'live');
    assert.equal((await request('/deployments/' + deployment.deploymentId)).data.source, 'github');
    assert.match((await site(`${project.slug}--${deployment.deploymentId}`)).body, /version two/);
    const before = upstreamRequests.filter(request => request.pathname.endsWith('/docs/assets/site.css')).length;
    await site(project.slug, '/assets/site.css'); await site(project.slug, '/assets/site.css');
    assert.equal(upstreamRequests.filter(request => request.pathname.endsWith('/docs/assets/site.css')).length, before + 2);
    assert.ok(upstreamRequests.length > 0);
    assert.ok(upstreamRequests.every(request => !request.authorization && !request.cookie));
    for (const name of ['uploads', 'workspaces', 'artifacts']) assert.deepEqual(await fs.readdir(path.join(directory, name)), [], name + ' must contain no website files');
    assert.equal((await request(`/deployments/${first.id}/artifact`)).status, 409);
    assert.equal((await request(`/projects/${project.id}/files`)).status, 409);
  });
  await t.test('public admin-prefix viewer isolates the website and forwards its path safely', async () => {
    const previousOrigin = process.env.API_ORIGIN;
    process.env.API_ORIGIN = apiOrigin;
    try {
      const { NextRequest } = await import('next/server.js');
      const { GET, HEAD } = await import('../../apps/dashboard/app/admin/[projectSlug]/[[...sitePath]]/route.js');
      const viewerUrl = `${dashboardOrigin}/admin/${project.slug}/about/?deployment=${first.id}&theme=dark`;
      const params = Promise.resolve({ projectSlug: project.slug, sitePath: ['about'] });
      const response = await GET(new NextRequest(viewerUrl), { params });
      assert.equal(response.status, 200);
      const body = await response.text();
      assert.match(body, /<iframe /);
      assert.match(body, /sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"/);
      assert.ok(body.includes(`src="http://${project.slug}--${first.id}.localhost:${runtimePort}/about/?theme=dark"`));
      assert.equal(body.includes('allow-top-navigation'), false);
      assert.match(response.headers.get('Content-Security-Policy') || '', /default-src 'none'; frame-src http:/);
      assert.match(response.headers.get('Content-Security-Policy') || '', /frame-ancestors 'none'/);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
      const head = await HEAD(new NextRequest(viewerUrl), { params });
      assert.equal(head.status, 200); assert.equal(await head.text(), '');
      const missing = await GET(new NextRequest(`${dashboardOrigin}/admin/not-deployed`), {
        params: Promise.resolve({ projectSlug: 'not-deployed' }),
      });
      assert.equal(missing.status, 404);
    } finally {
      if (previousOrigin === undefined) delete process.env.API_ORIGIN;
      else process.env.API_ORIGIN = previousOrigin;
    }
  });
});
