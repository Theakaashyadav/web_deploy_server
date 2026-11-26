import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { authorizePath, isWithin } from '../src/authorization.js';

test('path containment rejects sibling prefixes and parent traversal', () => {
  const root = path.resolve('project');
  assert.equal(isWithin(root, root), true);
  assert.equal(isWithin(root, path.join(root, 'src', 'index.html')), true);
  assert.equal(isWithin(root, path.resolve('project-other')), false);
  assert.equal(isWithin(root, path.resolve('project', '..', 'secret')), false);
});

test('authorized roots are required and canonical paths enforce containment', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'deployhub-mcp-test-'));
  try {
    const allowed = path.join(root, 'allowed'); const outside = path.join(root, 'outside');
    await mkdir(allowed); await mkdir(outside); await writeFile(path.join(allowed, 'index.html'), 'ok');
    await assert.rejects(authorizePath(path.join(allowed, 'index.html'), []), /disabled/);
    await assert.rejects(authorizePath(outside, [allowed]), /outside/);
    await assert.rejects(authorizePath('relative/path', [allowed]), /absolute/);
    assert.equal(await authorizePath(path.join(allowed, 'index.html'), [allowed]), await realpath(path.join(allowed, 'index.html')));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('symlink and Windows junction escapes are denied after realpath', async context => {
  const root = await mkdtemp(path.join(tmpdir(), 'deployhub-mcp-test-'));
  try {
    const allowed = path.join(root, 'allowed'); const outside = path.join(root, 'outside');
    await mkdir(allowed); await mkdir(outside);
    try { await symlink(outside, path.join(allowed, 'escape'), process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) { if (['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) { context.skip('OS does not grant symlink creation'); return; } throw error; }
    await assert.rejects(authorizePath(path.join(allowed, 'escape'), [allowed]), /outside/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
