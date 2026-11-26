import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { preparePublishedHtml, selectWebsiteLayout, validateStaticWebsite } from '../packages/storage/src/website-layout.js';
import { config } from '../packages/shared/src/config.js';

async function temporary(fn: (directory: string) => Promise<void>) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'deployhub-layout-'));
  try { await fn(directory); } finally { await fs.rm(directory, { recursive: true, force: true }); }
}
async function files(root: string, values: Record<string, string>) {
  for (const [relative, value] of Object.entries(values)) { const target = path.join(root, relative); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, value); }
}
const vitePackage = JSON.stringify({ devDependencies: { vite: '8' }, scripts: { build: 'vite build' } });
const html = '<!doctype html><h1>Website</h1>';

test('deeply wrapped HTML uploads locate the website without moving asset paths', async () => temporary(async directory => {
  await files(directory, { 'outer/middle/inner/index.html': '<link rel="stylesheet" href="assets/style.css"><script src="scripts/main.js"></script>', 'outer/middle/inner/assets/style.css': 'body{}', 'outer/middle/inner/scripts/main.js': 'console.log("ready")' });
  const layout = await selectWebsiteLayout(directory);
  assert.equal(layout.rootDirectory, 'outer/middle/inner');
  assert.equal(layout.staticDirectory, path.join(directory, 'outer/middle/inner'));
  assert.equal(layout.entryFile, 'index.html');
  assert.equal(await fs.readFile(path.join(layout.staticDirectory!, 'assets/style.css'), 'utf8'), 'body{}');
}));

test('a public website folder is found next to readmes and other directories', async () => temporary(async directory => {
  await files(directory, { 'export/README.md': 'Instructions', 'export/project/public/index.html': html, 'export/docs/index.html': '<p>Documentation</p>', 'export/notes.txt': 'notes' });
  const layout = await selectWebsiteLayout(directory);
  assert.equal(layout.staticDirectory, path.join(directory, 'export/project/public'));
}));

test('framework package root takes priority over public HTML templates and source entry files', async () => temporary(async directory => {
  await files(directory, { 'download/site/package.json': vitePackage, 'download/site/index.html': '<script type="module" src="/src/main.jsx"></script>', 'download/site/public/index.html': '<script src="%PUBLIC_URL%/app.js"></script>', 'download/site/src/main.jsx': 'import React from "react";' });
  const layout = await selectWebsiteLayout(directory);
  assert.equal(layout.projectRoot, path.join(directory, 'download/site'));
  assert.equal(layout.staticDirectory, undefined);
  assert.match(layout.notes.join(' '), /isolated worker/);
}));

test('a validated prebuilt dist is used without requiring a source build', async () => temporary(async directory => {
  await files(directory, { 'archive/app/package.json': vitePackage, 'archive/app/index.html': '<script type="module" src="/src/main.jsx"></script>', 'archive/app/src/main.jsx': 'source', 'archive/app/dist/index.html': '<script type="module" src="/assets/app.js"></script>', 'archive/app/dist/assets/app.js': 'console.log("built")' });
  const layout = await selectWebsiteLayout(directory);
  assert.equal(layout.staticDirectory, path.join(directory, 'archive/app/dist'));
  assert.equal(layout.prebuilt, true);
  const rebuild = await selectWebsiteLayout(directory, { buildCommand: 'npm run build' });
  assert.equal(rebuild.staticDirectory, undefined, 'an explicit build command must still run');
}));

test('Angular browser output is selected instead of the accompanying server template', async () => temporary(async directory => {
  await files(directory, { 'app/package.json': JSON.stringify({ dependencies: { '@angular/core': '22' }, scripts: { build: 'ng build' } }), 'app/dist/client/browser/index.html': html, 'app/dist/client/server/index.server.html': '<app-root></app-root>' });
  const layout = await selectWebsiteLayout(directory);
  assert.equal(layout.staticDirectory, path.join(directory, 'app/dist/client/browser'));
}));

test('independent websites require a root selection rather than silently publishing one', async () => temporary(async directory => {
  await files(directory, { 'websites/one/index.html': html, 'websites/two/index.html': html });
  await assert.rejects(selectWebsiteLayout(directory), /Multiple website entry folders.*websites\/one.*websites\/two/);
  const chosen = await selectWebsiteLayout(directory, { rootDirectory: 'websites/two' });
  assert.equal(chosen.staticDirectory, path.join(directory, 'websites/two'));
}));

test('manual root paths work with and without the folder-picker wrapper', async () => temporary(async directory => {
  await files(directory, { 'SelectedFolder/apps/one/package.json': vitePackage, 'SelectedFolder/apps/two/package.json': vitePackage });
  await assert.rejects(selectWebsiteLayout(directory), /Multiple application folders/);
  for (const rootDirectory of ['SelectedFolder/apps/one', 'apps/one']) {
    const chosen = await selectWebsiteLayout(directory, { rootDirectory });
    assert.equal(chosen.projectRoot, path.join(directory, 'SelectedFolder/apps/one'));
  }
  await assert.rejects(selectWebsiteLayout(directory, { rootDirectory: '../outside' }), /Unsafe|escapes/);
  await assert.rejects(selectWebsiteLayout(directory, { rootDirectory: 'absent' }), /was not found/);
}));

test('manual output directory overrides automatic detection and missing static outputs fail clearly', async () => temporary(async directory => {
  await files(directory, { 'Website/index.html': html, 'Website/public/index.html': '<h1>Public</h1>' });
  const layout = await selectWebsiteLayout(directory, { outputDirectory: 'public' });
  assert.equal(layout.staticDirectory, path.join(directory, 'Website/public'));
  await assert.rejects(selectWebsiteLayout(directory, { outputDirectory: 'missing' }), /Output directory.*was not found/);
}));

test('explicit public output is resolved before stripping folder-picker wrappers', async () => temporary(async directory => {
  await files(directory, { 'Selected Website/README.md': 'notes', 'Selected Website/public/index.html': html, 'Selected Website/public/assets/hero.svg': '<svg />' });
  const layout = await selectWebsiteLayout(directory, { outputDirectory: 'public' });
  assert.equal(layout.projectRoot, path.join(directory, 'Selected Website'));
  assert.equal(layout.staticDirectory, path.join(directory, 'Selected Website/public'));
}));

test('nested entry points include sibling assets and retain relative URLs with a canonical entry', async () => temporary(async directory => {
  await files(directory, { 'Website/pages/index.html': '<!doctype html><html><head><link rel="stylesheet" href="../assets/site.css"></head><body><img src="../assets/hero.svg"><script src="../scripts/app.js"></script></body></html>', 'Website/assets/site.css': 'body{background:url("hero.svg")}', 'Website/assets/hero.svg': '<svg />', 'Website/scripts/app.js': 'console.log("ready")' });
  const layout = await selectWebsiteLayout(directory);
  assert.equal(layout.staticDirectory, path.join(directory, 'Website'));
  assert.equal(layout.entryFile, 'pages/index.html');
  const published = preparePublishedHtml(await fs.readFile(path.join(layout.staticDirectory!, layout.entryFile!), 'utf8'), layout.entryFile!);
  assert.match(published, /<base href="\/pages\/">/);
  await fs.writeFile(path.join(layout.staticDirectory!, 'index.html'), published);
  assert.equal(await validateStaticWebsite(layout.staticDirectory!), 'index.html');
}));

test('Unicode paths and existing relative base elements survive canonical publication', async () => temporary(async directory => {
  await files(directory, { 'साइट/पृष्ठ/index.html': '<head><base href="../चित्र/"></head><img src="logo.svg">', 'साइट/चित्र/logo.svg': '<svg />' });
  const layout = await selectWebsiteLayout(directory);
  assert.equal(layout.staticDirectory, path.join(directory, 'साइट'));
  const published = preparePublishedHtml(await fs.readFile(path.join(layout.staticDirectory!, layout.entryFile!), 'utf8'), layout.entryFile!);
  assert.match(published, /<base href="\/%E0%A4/);
  await fs.writeFile(path.join(layout.staticDirectory!, 'index.html'), published);
  assert.equal(await validateStaticWebsite(layout.staticDirectory!), 'index.html');
}));

test('dependency caches and archive metadata cannot become a website root', async () => temporary(async directory => {
  await files(directory, { '__MACOSX/fake/index.html': html, 'node_modules/dependency/package.json': '{broken', 'upload/site/index.html': html, '.DS_Store': 'metadata' });
  const layout = await selectWebsiteLayout(directory);
  assert.equal(layout.staticDirectory, path.join(directory, 'upload/site'));
}));

test('unbuilt JSX, unresolved module imports and missing assets are rejected before publishing', async () => temporary(async directory => {
  await files(directory, { 'index.html': '<script type="module" src="/src/main.jsx"></script>', 'src/main.jsx': 'source' });
  await assert.rejects(selectWebsiteLayout(directory), /unbuilt TypeScript\/JSX/);
  await files(directory, { 'index.html': '<script type="module" src="/src/main.js"></script>', 'src/main.js': 'import React from "react";' });
  await assert.rejects(validateStaticWebsite(directory), /need bundling/);
  await files(directory, { 'index.html': '<link rel="stylesheet" href="assets/missing.css">' });
  await assert.rejects(validateStaticWebsite(directory), /missing script or stylesheet.*assets\/missing.css/);
}));

test('asset paths stay within the selected website and safe internal dot segments work', async () => temporary(async directory => {
  await files(directory, { 'index.html': '<script src="assets/../main.js"></script>', 'main.js': 'console.log("ready")', 'assets/.keep': '' });
  assert.equal(await validateStaticWebsite(directory), 'index.html');
  await files(directory, { 'index.html': '<script src="../private.js"></script>' });
  await assert.rejects(validateStaticWebsite(directory), /outside its publish folder|missing script or stylesheet/);
}));

test('missing images referenced by HTML or CSS fail before a broken website is marked live', async () => temporary(async directory => {
  await files(directory, { 'index.html': '<img src="missing.svg">' });
  await assert.rejects(selectWebsiteLayout(directory), /missing script or stylesheet\/image.*missing.svg/);
  await files(directory, { 'index.html': '<link rel="stylesheet" href="assets/site.css">', 'assets/site.css': 'body{background:url("missing.svg")}' });
  await assert.rejects(selectWebsiteLayout(directory), /missing script or stylesheet\/image.*missing.svg/);
}));

test('common HTML entry filenames are detected for canonical artifact normalization', async () => temporary(async directory => {
  for (const name of ['Index.HTML', 'index.htm', 'home.html']) {
    const root = path.join(directory, name.replace('.', '-')); await files(root, { [name]: html });
    const layout = await selectWebsiteLayout(root);
    assert.equal(layout.entryFile, name); assert.match(layout.notes.join(' '), /expose .* as index.html/);
  }
}));

test('folder discovery rejects symlinks and stays within file-count/depth budgets', async () => temporary(async directory => {
  await files(directory, { 'source/index.html': html, 'outside/index.html': 'outside' });
  await fs.symlink(path.join(directory, 'outside'), path.join(directory, 'source/linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(selectWebsiteLayout(path.join(directory, 'source')), /Symbolic links/);
  const old = config.maxFiles; config.maxFiles = 1;
  try { await assert.rejects(selectWebsiteLayout(directory), /Too many files/); } finally { config.maxFiles = old; }
  const deep = path.join(directory, 'deep'); await files(deep, { [Array(66).fill('d').join('/') + '/index.html']: html });
  await assert.rejects(selectWebsiteLayout(deep), /maximum nesting depth/);
}));
