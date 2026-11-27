import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertGitHubStaticSource, fetchGitHubStaticFile, normalizeGitHubBranch, normalizeGitHubDirectory,
  normalizeGitHubFilePath, parseGitHubRepository, resolveGitHubStaticSource,
  validateGitHubStaticHtml,
  type GitHubStaticSource,
} from '../packages/shared/src/github-static.js';

const commit = 'a1'.repeat(20);
const source: GitHubStaticSource = { repository: 'https://github.com/example/site', owner: 'example', repo: 'site', branch: 'main', commit, directory: 'dist' };
const raw = `https://raw.githubusercontent.com/example/site/${commit}/dist/`;

function mockFetch(routes: Record<string, Response | (() => Response)>, calls: string[] = []): typeof fetch {
  return async (input, init) => {
    const url = String(input); calls.push(url);
    assert.equal(init?.redirect, 'error');
    assert.equal(init?.credentials, 'omit');
    assert.ok(init?.signal);
    assert.equal(new Headers(init?.headers).has('authorization'), false);
    const response = routes[url];
    if (!response) throw new Error(`Unexpected request: ${url}`);
    return typeof response === 'function' ? response() : response;
  };
}
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

test('GitHub input accepts canonical public repositories and rejects arbitrary origins, credentials and URL variants', () => {
  assert.deepEqual(parseGitHubRepository('https://github.com/example/site.git/'), { repository: source.repository, owner: 'example', repo: 'site' });
  for (const value of [
    'http://github.com/example/site', 'https://example.com/example/site', 'https://github.com.evil.test/example/site',
    'https://token@github.com/example/site', 'https://github.com:444/example/site', 'https://github.com/example/site?token=secret',
    'https://github.com/example/site#main', 'https://github.com/example/site/tree/main', 'git@github.com:example/site.git',
    'https://github.com/example', 'https://github.com/example/%2frepo',
  ]) assert.throws(() => parseGitHubRepository(value), /GitHub|repository/);
});

test('static directories and requests reject traversal, secrets and executable source', () => {
  assert.equal(normalizeGitHubDirectory(), '.');
  assert.equal(normalizeGitHubDirectory('website/dist/'), 'website/dist');
  assert.equal(normalizeGitHubFilePath(''), 'index.html');
  assert.equal(normalizeGitHubFilePath('guides/'), 'guides/index.html');
  assert.equal(normalizeGitHubFilePath('.well-known/security.txt'), '.well-known/security.txt');
  for (const value of ['../private', '/etc', 'a/../private', 'C:/private', 'a\\file', 'a//file', '.env', '.git/config', '%2e%2e/file', 'a\0file', 'node_modules/pkg', 'a?query', 'a#hash']) assert.throws(() => normalizeGitHubDirectory(value));
  for (const value of ['.env', 'package.json', 'package-lock.json', 'src/main.tsx', 'app.jsx', 'server.php', 'script.sh', 'README.md', 'api.py', '../index.html', '%2e%2e/index.html']) assert.throws(() => normalizeGitHubFilePath(value));
  assert.equal(normalizeGitHubBranch('release/site'), 'release/site');
  for (const value of ['', 'main..old', '.branch', 'a/.branch', 'a.lock', 'main~1', 'main@{1}', 'main?x', 'a//b', 'main%2ffoo', '/main']) assert.throws(() => normalizeGitHubBranch(value));
});

test('resolution pins the default branch and validates HTML and assets against the same immutable commit', async () => {
  const calls: string[] = [];
  const resolved = await resolveGitHubStaticSource({ repository: source.repository, directory: 'dist' }, { fetch: mockFetch({
    'https://api.github.com/repos/example/site': json({ default_branch: 'main', private: false }),
    'https://api.github.com/repos/example/site/commits/main': json({ sha: commit }),
    [raw + 'index.html']: new Response('<!doctype html><html><link rel="stylesheet" href="assets/site.css"><body><h1>Ready</h1><script type="module" src="/assets/app.js?v=1"></script><img src="https://images.example.test/logo.png"></body></html>'),
    [raw + 'assets/site.css']: new Response('body{color:blue}'),
    [raw + 'assets/app.js']: new Response('window.ready=true;'),
  }, calls) });
  assert.deepEqual(resolved, source);
  assert.equal(calls.length, 5);
  assert.ok(calls.slice(2).every(value => value.startsWith(raw)));
});

test('an explicit branch with a slash is encoded as one ref and avoids a default-branch request', async () => {
  const calls: string[] = [];
  const resolved = await resolveGitHubStaticSource({ repository: source.repository, branch: 'release/site' }, { fetch: mockFetch({
    'https://api.github.com/repos/example/site/commits/release%2Fsite': json({ sha: commit }),
    [`https://raw.githubusercontent.com/example/site/${commit}/index.html`]: new Response('<h1>Static site</h1>'),
  }, calls) });
  assert.equal(resolved.branch, 'release/site');
  assert.equal(resolved.directory, '.');
  assert.equal(calls.length, 2);
});

test('private repositories, invalid metadata and unavailable commits fail before activation', async () => {
  await assert.rejects(resolveGitHubStaticSource({ repository: source.repository }, { fetch: mockFetch({ 'https://api.github.com/repos/example/site': json({ private: true, default_branch: 'main' }) }) }), /public/);
  await assert.rejects(resolveGitHubStaticSource({ repository: source.repository, branch: 'main' }, { fetch: mockFetch({ 'https://api.github.com/repos/example/site/commits/main': json({ sha: 'not-a-commit' }) }) }), /immutable commit/);
  await assert.rejects(resolveGitHubStaticSource({ repository: source.repository, branch: 'main' }, { fetch: mockFetch({ 'https://api.github.com/repos/example/site/commits/main': new Response('', { status: 404 }) }) }), /not found/);
  await assert.rejects(resolveGitHubStaticSource({ repository: source.repository, branch: 'main' }, { fetch: mockFetch({ 'https://api.github.com/repos/example/site/commits/main': new Response('', { status: 429 }) }) }), /limit/);
});

test('missing entry, unbuilt source and missing direct assets fail the static readiness check', async () => {
  for (const [entry, error] of [
    [new Response('', { status: 404 }), /index.html/],
    [new Response('Not an HTML document'), /ready HTML/],
    [new Response('<html><script src="%PUBLIC_URL%/main.js"></script></html>'), /unbuilt/],
    [new Response('<div id="root"></div><script type="module" src="/src/main.tsx"></script>'), /static|source/],
    [new Response('<html><h1>%PUBLIC_URL%</h1></html>'), /needs a build/],
    [new Response('version https://git-lfs.github.com/spec/v1\noid sha256:123'), /index.html/],
    [new Response('<h1>Missing CSS</h1><link rel="stylesheet" href="app.css">'), /not found/],
  ] as const) {
    await assert.rejects(resolveGitHubStaticSource({ repository: source.repository, branch: 'main', directory: 'dist' }, { fetch: mockFetch({
      'https://api.github.com/repos/example/site/commits/main': json({ sha: commit }),
      [raw + 'index.html']: entry,
      [raw + 'app.css']: new Response('', { status: 404 }),
    }) }), error);
  }
});

test('asset fetches preserve binary bytes and return browser MIME types without trusting GitHub content-type', async () => {
  const bytes = Uint8Array.from([0, 255, 128, 42]);
  const file = await fetchGitHubStaticFile(source, 'assets/logo.png', { fetch: mockFetch({
    [raw + 'assets/logo.png']: new Response(bytes, { headers: { 'Content-Type': 'text/plain', ETag: 'test-etag' } }),
  }) });
  assert.deepEqual(file.body, Buffer.from(bytes));
  assert.equal(file.contentType, 'image/png');
  assert.equal(file.etag, 'test-etag');
  const missing = await fetchGitHubStaticFile(source, 'missing.html', { fetch: mockFetch({ [raw + 'missing.html']: new Response('missing', { status: 404 }) }) });
  assert.equal(missing.status, 404);
});

test('direct browser modules reject unbundled packages and JSX while supporting relative imports and importmaps', async () => {
  const html = '<div id="root"></div><script type="module" src="app.js"></script>';
  for (const javascript of ["import React from 'react';", "import '@scope/package';", "export { value } from 'library';"]) {
    await assert.rejects(validateGitHubStaticHtml(source, html, { fetch: mockFetch({ [raw + 'app.js']: new Response(javascript) }) }), /needs bundling/);
  }
  for (const javascript of ['function App() { return <h1>Source</h1>; }', 'render(<App/>);', 'const App = () => <><h1>Source</h1></>;']) {
    await assert.rejects(validateGitHubStaticHtml(source, html, { fetch: mockFetch({ [raw + 'app.js']: new Response(javascript) }) }), /unbuilt JSX/);
  }
  await validateGitHubStaticHtml(source, html, { fetch: mockFetch({ [raw + 'app.js']: new Response("import { value } from './built.js'; document.body.textContent = value;") }) });
  await validateGitHubStaticHtml(source, '<script type="importmap">{"imports":{"library":"https://cdn.example.test/library.js"}}</script>' + html, {
    fetch: mockFetch({ [raw + 'app.js']: new Response("import { value } from 'library';") }),
  });
  await validateGitHubStaticHtml(source, html, { fetch: mockFetch({ [raw + 'app.js']: new Response('const example = "return <h1>Example</h1>"; const markup = `<App/>`; /* return <Component/> */\nconsole.log(example, markup);') }) });
});

test('validation shares one deadline across repository, commit and asset requests', async () => {
  let calls = 0;
  const delayed: typeof fetch = async (_input, init) => {
    calls++;
    if (calls === 1) {
      await new Promise(resolve => setTimeout(resolve, 15));
      return json({ default_branch: 'main', private: false });
    }
    return new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted'))));
  };
  await assert.rejects(resolveGitHubStaticSource({ repository: source.repository }, { fetch: delayed, timeoutMs: 1000, validationTimeoutMs: 30 }), /timed out|total time budget/);
  assert.ok(calls <= 2);
});

test('streaming and declared asset size limits are both enforced and cancel oversized responses', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(6)); controller.enqueue(new Uint8Array(6)); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(fetchGitHubStaticFile(source, 'large.png', { maxBytes: 10, fetch: mockFetch({ [raw + 'large.png']: new Response(stream) }) }), /size limit/);
  assert.equal(cancelled, true);
  await assert.rejects(fetchGitHubStaticFile(source, 'large.png', { maxBytes: 10, fetch: mockFetch({ [raw + 'large.png']: new Response('short', { headers: { 'Content-Length': '11' } }) }) }), /size limit/);
});

test('GitHub request deadlines abort stalled upstream fetches', async () => {
  const stalled: typeof fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted'))));
  await assert.rejects(fetchGitHubStaticFile(source, 'index.html', { fetch: stalled, timeoutMs: 5 }), /timed out/);
});

test('persisted source validation rejects mutable commits and metadata tampering before any request', async () => {
  assertGitHubStaticSource(source);
  for (const tampered of [{ ...source, commit: 'main' }, { ...source, owner: 'other' }, { ...source, directory: '../other' }, { ...source, repository: 'https://evil.test/a/b' }]) {
    assert.throws(() => assertGitHubStaticSource(tampered));
    await assert.rejects(fetchGitHubStaticFile(tampered, 'index.html', { fetch: async () => { assert.fail('Invalid source must never fetch'); } }));
  }
});
