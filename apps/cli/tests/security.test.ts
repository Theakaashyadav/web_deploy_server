import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mandatoryExcluded, packageDirectory } from '../src/package.js';
import { DeployHubClient } from '../src/client.js';

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(folder => rm(folder, { recursive: true, force: true }))); });
async function fixture(): Promise<string> {
  const folder = await mkdtemp(path.join(tmpdir(), 'deployhub-cli-test-')); temporary.push(folder); return folder;
}
function zipNames(buffer: Buffer): string[] {
  const names: string[] = [];
  for (let offset = 0; offset < buffer.length - 46; offset++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) continue;
    const length = buffer.readUInt16LE(offset + 28);
    names.push(buffer.subarray(offset + 46, offset + 46 + length).toString('utf8'));
    offset += 45 + length + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
  }
  return names;
}

test('mandatory exclusions protect credentials on both path separators', () => {
  for (const file of ['.env', '.env.production', 'a/.env.local', '.aws/credentials', 'node_modules/pkg/index.js', '.git/config', 'key.pem', 'id_ed25519', 'a\\.ssh\\id_rsa', '.npmrc', 'service-account-production.json', '.codex/auth.json', '.kube/config', 'secrets.yaml']) assert.equal(mandatoryExcluded(file), true, file);
  for (const file of ['index.html', 'assets/app.js', 'package-lock.json', 'public/environment.js']) assert.equal(mandatoryExcluded(file), false, file);
});

test('real ZIP excludes secrets and honors ignore rules without negating mandatory rules', async () => {
  const folder = await fixture();
  await mkdir(path.join(folder, 'notes'));
  await mkdir(path.join(folder, 'node_modules'));
  await writeFile(path.join(folder, 'index.html'), '<h1>working website</h1>');
  await writeFile(path.join(folder, '.env.local'), 'TOKEN=never-upload');
  await writeFile(path.join(folder, 'notes', 'private.txt'), 'excluded notes');
  await writeFile(path.join(folder, 'node_modules', 'package.js'), 'dependency');
  await writeFile(path.join(folder, '.deployhubignore'), 'notes/\n!.env.local\n!node_modules/\n');
  const archive = await packageDirectory(folder);
  try {
    assert.deepEqual(zipNames(await readFile(archive.path)).sort(), ['.deployhubignore', 'index.html']);
    assert.equal(archive.fileCount, 2);
  } finally { await archive.cleanup(); }
});

test('packaging enforces uncompressed resource limits', async () => {
  const folder = await fixture();
  await writeFile(path.join(folder, 'index.html'), '12345');
  await assert.rejects(packageDirectory(folder, { maxBytes: 4 }), /upload limit/);
  await assert.rejects(packageDirectory(folder, { maxFiles: 0 }), /file limit/);
});

test('packaging rejects symlinks instead of reading outside the selected project', async context => {
  const folder = await fixture(); const external = await fixture();
  await writeFile(path.join(external, 'secret.txt'), 'outside');
  try { await symlink(path.join(external, 'secret.txt'), path.join(folder, 'link.txt')); }
  catch (error) { if (['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) { context.skip('OS does not grant symlink creation'); return; } throw error; }
  await assert.rejects(packageDirectory(folder), /Symbolic links/);
});

test('remote credentials require HTTPS and reject embedded URL credentials', () => {
  assert.throws(() => new DeployHubClient('http://example.com', 'secret'), /HTTPS/);
  assert.throws(() => new DeployHubClient('https://user:pass@example.com', 'secret'), /embed credentials/);
  assert.equal(new DeployHubClient('http://localhost:4100/', 'secret').baseUrl, 'http://localhost:4100');
});

test('client never reports an unverified live response without the requested URL', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ id: 'dpl_test', status: 'live', environment: 'preview' }), { headers: { 'Content-Type': 'application/json' } });
    await assert.rejects(new DeployHubClient('http://localhost:4100', 'secret').wait('dpl_test'), /without a verified URL/);
    globalThis.fetch = async () => new Response(JSON.stringify({ id: 'dpl_test', status: 'failed', error: 'build failed' }), { headers: { 'Content-Type': 'application/json' } });
    await assert.rejects(new DeployHubClient('http://localhost:4100', 'secret').wait('dpl_test'), /build failed/);
  } finally { globalThis.fetch = original; }
});

test('log following drains every page even when deployment has already finished', async () => {
  const original = globalThis.fetch;
  const messages: string[] = [];
  try {
    globalThis.fetch = async input => {
      const url = new URL(String(input));
      const payload = url.pathname.endsWith('/logs')
        ? { logs: Number(url.searchParams.get('after')) === 0
          ? Array.from({ length: 2000 }, (_, index) => ({ id: index + 1, message: `line ${index + 1}` }))
          : [{ id: 2001, message: 'last line' }] }
        : { id: 'dpl_test', status: 'live', environment: 'preview', previewUrl: 'http://preview.localhost:4101' };
      return new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } });
    };
    await new DeployHubClient('http://localhost:4100', 'secret').wait('dpl_test', { onLog: log => messages.push(log.message) });
    assert.equal(messages.length, 2001);
    assert.equal(messages.at(-1), 'last line');
  } finally { globalThis.fetch = original; }
});
