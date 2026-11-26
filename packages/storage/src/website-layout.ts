import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../shared/src/config.js';
import { safePath } from './safe-files.js';
import { detectFramework } from '../../framework-adapters/src/index.js';

const ignoredDirectories = new Set(['node_modules', '.git', '.hg', '.svn', '.next', '.cache', '.npm-cache', '.pnpm-store', '.parcel-cache', '.turbo', '.local', '.tmp', 'backups', '__macosx', 'coverage']);
const ignoredWrapperFiles = /^(?:\.ds_store|thumbs\.db|desktop\.ini|readme(?:\.[^/]+)?|licen[cs]e(?:\.[^/]+)?)$/i;
const outputNames = new Set(['dist', 'build', 'out', 'public', 'site', 'www', 'html', 'browser']);
const entryNames = ['index.html', 'index.htm', 'default.html', 'default.htm'];
const frameworkDependencies = ['vite', 'next', 'nuxt', 'astro', 'react-scripts', '@angular/core', '@sveltejs/kit', 'svelte', 'vue'];
const limitDepth = 64;
type DirectoryRecord = { directory: string; names: string[]; entry?: string; packageApp: boolean; frameworkApp: boolean; buildSource: boolean; packagePresent: boolean };
export type WebsiteSettings = { rootDirectory?: string; outputDirectory?: string; framework?: string; buildCommand?: string; installCommand?: string };
export type WebsiteLayout = { projectRoot: string; staticDirectory?: string; entryFile?: string; rootDirectory: string; outputDirectory?: string; prebuilt: boolean; notes: string[] };

const relativeName = (base: string, directory: string) => path.relative(base, directory).replace(/\\/g, '/') || '.';
const isWithin = (base: string, directory: string) => { const relative = path.relative(base, directory); return !relative || (!relative.startsWith('..'+path.sep) && relative !== '..' && !path.isAbsolute(relative)); };
const existsDirectory = async (directory: string) => fs.lstat(directory).then(stat => stat.isDirectory() && !stat.isSymbolicLink(), () => false);

async function scanDirectories(base: string): Promise<DirectoryRecord[]> {
  const baseStat = await fs.lstat(base);
  if (!baseStat.isDirectory() || baseStat.isSymbolicLink()) throw new Error('The website upload must be a regular directory, not a symbolic link');
  const records: DirectoryRecord[] = [];
  const pending = [{ directory: base, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const { directory, depth } = pending.pop()!;
    if (depth > limitDepth) throw new Error(`Website folders exceed the maximum nesting depth (${limitDepth}). Remove unnecessary wrapper folders.`);
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const names: string[] = [];
    for (const entry of entries) {
      if (++count > config.maxFiles) throw new Error('Too many files while locating the website root');
      const full = path.join(directory, entry.name);
      const stat = await fs.lstat(full);
      if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) throw new Error('Symbolic links and special files are forbidden');
      if (stat.isDirectory()) {
        if (!ignoredDirectories.has(entry.name.toLowerCase())) pending.push({ directory: full, depth: depth + 1 });
      } else names.push(entry.name);
    }
    let entry = entryNames.map(name => names.find(file => file.toLowerCase() === name)).find(Boolean);
    // A folder with exactly one HTML document can be published without renaming source files.
    if (!entry) { const html = names.filter(name => /\.html?$/i.test(name)); if (html.length === 1) entry = html[0]; }
    let packageApp = false, frameworkApp = false, buildSource = false;
    const packagePresent = names.includes('package.json');
    if (packagePresent) {
      const stat = await fs.stat(path.join(directory, 'package.json'));
      if (stat.size > 1048576) throw new Error(`package.json at ${relativeName(base, directory)} exceeds the allowed size`);
      let pkg: any;
      try { pkg = JSON.parse((await fs.readFile(path.join(directory, 'package.json'), 'utf8')).replace(/^\uFEFF/, '')); }
      catch { throw new Error(`Invalid package.json in ${relativeName(base, directory)}. Fix the JSON or upload the built website folder.`); }
      if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) throw new Error(`Invalid package.json in ${relativeName(base, directory)}`);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      frameworkApp = frameworkDependencies.some(name => Boolean(deps[name]));
      const hasBuild = Boolean(pkg.scripts?.build || pkg.scripts?.start || pkg.scripts?.generate);
      buildSource = frameworkApp || hasBuild;
      packageApp = frameworkApp || (!pkg.workspaces && (hasBuild || Boolean(entry) || Object.keys(deps).length > 0));
    }
    if (!packagePresent && !entry && ['server.js','server.mjs','server.cjs'].some(name => names.includes(name))) {
      packageApp = true;
      buildSource = true;
    }
    records.push({ directory, names, entry, packageApp, frameworkApp, buildSource, packagePresent });
  }
  return records;
}

async function wrapperBases(base: string) {
  const result = [base]; let current = base;
  for (let depth = 0; depth < limitDepth; depth++) {
    const entries = (await fs.readdir(current, { withFileTypes: true })).filter(entry => !ignoredDirectories.has(entry.name.toLowerCase()) && !ignoredWrapperFiles.test(entry.name));
    if (entries.length !== 1 || !entries[0].isDirectory()) break;
    current = path.join(current, entries[0].name); result.push(current);
  }
  return result;
}

function ambiguous(base: string, records: DirectoryRecord[], kind: string): never {
  const candidates = records.map(record => relativeName(base, record.directory)).sort();
  throw new Error(`Multiple ${kind} were found: ${candidates.slice(0, 8).join(', ')}${candidates.length > 8 ? ', …' : ''}. Choose the website's Root directory or Output directory in project settings.`);
}

function outermost(records: DirectoryRecord[]) {
  return records.filter(record => !records.some(other => other !== record && isWithin(other.directory, record.directory)));
}

function chooseStatic(base: string, records: DirectoryRecord[]) {
  const candidates = outermost(records.filter(record => record.entry));
  if (candidates.length === 1) return candidates[0];
  if (!candidates.length) return undefined;
  // A conventional output next to documentation/source is the intended publish folder.
  const outputs = candidates.filter(record => outputNames.has(path.basename(record.directory).toLowerCase()));
  if (outputs.length === 1) return outputs[0];
  ambiguous(base, outputs.length > 1 ? outputs : candidates, 'website entry folders');
}

const attribute = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find(value => value !== undefined);
const publicUrl = (relative: string) => new URL('http://deployhub.invalid/' + relative.split('/').map(encodeURIComponent).join('/'));

function localAsset(directory: string, raw: string, base: URL) {
  if (!raw || raw.startsWith('#')) return undefined;
  let url: URL;
  try { url = new URL(raw.replaceAll('&amp;', '&'), base); } catch { throw new Error(`Invalid asset path: ${raw}`); }
  if (url.origin !== 'http://deployhub.invalid') return undefined;
  let location: string;
  try { location = decodeURIComponent(url.pathname); } catch { throw new Error(`Invalid encoded asset path: ${raw}`); }
  if (location.includes('\0') || location.includes('\\')) throw new Error(`Unsafe asset path: ${raw}`);
  const asset = path.resolve(directory, location.replace(/^\/+/, ''));
  if (!isWithin(directory, asset)) throw new Error(`The website references an asset outside its publish folder: ${raw}. Upload the complete website folder and choose its matching Root/Output directory.`);
  return { asset, url };
}

/** Validates browser-ready HTML only; never executes uploaded configuration or source. */
export async function validateStaticWebsite(directory: string, preferredEntry?: string): Promise<string> {
  const names = await fs.readdir(directory);
  let entry = preferredEntry || entryNames.map(name => names.find(file => file.toLowerCase() === name)).find(Boolean);
  if (!entry) { const html = names.filter(name => /\.html?$/i.test(name)); if (html.length === 1) entry = html[0]; }
  if (!entry) throw new Error('No website entry HTML was found. Upload a folder containing index.html, a complete build output, or configure the correct Output directory.');
  const entryPath = safePath(directory, entry), stat = await fs.lstat(entryPath);
  if (!stat.isFile() || stat.isSymbolicLink() || !stat.size) throw new Error('Website entry HTML must be a non-empty regular file');
  if (stat.size > 8388608) throw new Error('Website entry HTML exceeds 8 MiB');
  const html = await fs.readFile(entryPath, 'utf8');
  if (/%(?:PUBLIC_URL|BASE_URL|VITE_[A-Z\d_]+)%|\/@vite\/client/.test(html)) throw new Error('The HTML is an unbuilt framework template. Upload its dist/build/out folder or enable the isolated framework build worker.');
  let base = publicUrl(entry.replace(/\\/g, '/'));
  const baseTag = html.match(/<base\b[^>]*>/i)?.[0], href = baseTag && attribute(baseTag, 'href');
  if (href) { try { base = new URL(href, base); } catch { throw new Error('Invalid HTML base URL'); } }
  const inspected = new Set<string>(); let references = 0;
  const check = async (raw: string, origin: URL, script = false, module = false, depth = 0): Promise<void> => {
    if (++references > Math.min(config.maxFiles * 4, 40000) || depth > limitDepth) throw new Error('Too many nested website asset references');
    if (script && /\.(?:tsx?|jsx)(?:[?#]|$)/i.test(raw)) throw new Error('The HTML references unbuilt TypeScript/JSX source. Upload the generated dist/build/out folder or enable the isolated framework build worker.');
    const local = localAsset(directory, raw, origin); if (!local) return;
    const { asset, url } = local;
    const stat = await fs.lstat(asset).catch(() => null);
    if (!stat?.isFile() || stat.isSymbolicLink()) throw new Error(`The website entry references a missing script or stylesheet/image: ${raw}. Upload the complete website, including its assets.`);
    if (inspected.has(asset)) return; inspected.add(asset);
    if (script && module && stat.size <= 1048576) {
      const javascript = await fs.readFile(asset, 'utf8');
      const imports = [...javascript.matchAll(/\b(?:import\s*(?:[^;\n]*?\sfrom\s*)?|export\s+[^;\n]*?\sfrom\s*)["']([^"']+)["']/g)];
      if (imports.some(match => !/^(?:[./]|[a-z][a-z\d+.-]*:)/i.test(match[1])) && !/<script\b[^>]*\btype\s*=\s*["']?importmap\b/i.test(html)) throw new Error('The website contains source modules that need bundling. Upload the built dist/build/out folder or enable the isolated framework build worker.');
    }
    if (/\.css$/i.test(url.pathname) && stat.size <= 2097152) {
      const css = await fs.readFile(asset, 'utf8');
      for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)|@import\s+["']([^"']+)["']/gi)) {
        const reference = match.slice(1).find(value => value !== undefined);
        if (reference) await check(reference, url, false, false, depth + 1);
      }
    }
  };
  const tags = html.match(/<(?:script|link|img|source|video|audio)\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const script = /^<script\b/i.test(tag);
    const link = /^<link\b/i.test(tag);
    if (link && !/\b(?:stylesheet|icon|modulepreload)\b/i.test(attribute(tag, 'rel') || '')) continue;
    const raw = attribute(tag, link ? 'href' : 'src');
    if (raw) await check(raw, base, script, (attribute(tag, 'type') || '').toLowerCase() === 'module');
    const poster = attribute(tag, 'poster'); if (poster) await check(poster, base);
  }
  return entry;
}

async function completePublishFolder(directory: string, entry: string, boundary: string) {
  const entryPath = path.join(directory, entry); let current = directory;
  let failure: Error | undefined;
  while (isWithin(boundary, current)) {
    const relative = relativeName(current, entryPath);
    try { await validateStaticWebsite(current, relative); return { directory: current, entry: relative }; }
    catch (error) {
      failure = error as Error;
      if (!/missing script or stylesheet|outside its publish folder/.test(failure.message)) throw error;
    }
    if (current === boundary) break;
    current = path.dirname(current);
  }
  throw failure || new Error('No complete publish folder was found');
}

/** Keep relative links working when a nested HTML entry also becomes the root document. */
export function preparePublishedHtml(html: string, entry: string) {
  const directory = path.posix.dirname(entry.replace(/\\/g, '/'));
  if (directory === '.') return html;
  const original = publicUrl(entry.replace(/\\/g, '/'));
  const existing = html.match(/<base\b[^>]*>/i)?.[0];
  const existingHref = existing && attribute(existing, 'href');
  const base = existingHref ? new URL(existingHref, original) : new URL('./', original);
  const href = base.origin === original.origin ? base.pathname + base.search + base.hash : base.href;
  const tag = `<base href="${href.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}">`;
  if (existingHref) return html.replace(existing!, tag);
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, match => match + '\n' + tag);
  if (/<html\b[^>]*>/i.test(html)) return html.replace(/<html\b[^>]*>/i, match => match + '<head>' + tag + '</head>');
  const doctype = html.match(/^\s*<!doctype[^>]*>/i)?.[0];
  return doctype ? html.replace(doctype, doctype + '\n' + tag) : tag + '\n' + html;
}

export async function selectWebsiteLayout(source: string, settings: WebsiteSettings = {}): Promise<WebsiteLayout> {
  const base = path.resolve(source);
  const records = await scanDirectories(base);
  const bases = await wrapperBases(base);
  const explicitRoot = settings.rootDirectory && settings.rootDirectory !== '.';
  let root: DirectoryRecord | undefined;
  if (explicitRoot) {
    for (const wrapper of bases) {
      const location = safePath(wrapper, settings.rootDirectory!);
      if (await existsDirectory(location)) { root = records.find(record => record.directory === location); if (root) break; }
    }
    if (!root) throw new Error(`Root directory '${settings.rootDirectory}' was not found in the upload. Choose a path relative to the uploaded folder.`);
  } else {
    if (settings.outputDirectory && settings.outputDirectory !== '.') {
      for (const wrapper of bases) {
        if (await existsDirectory(safePath(wrapper, settings.outputDirectory))) { root = records.find(record => record.directory === wrapper); if (root) break; }
      }
    }
    const applications = settings.framework === 'static' ? [] : outermost(records.filter(record => record.packageApp));
    if (!root && applications.length > 1) ambiguous(base, applications, 'application folders');
    root ||= applications[0] || chooseStatic(base, records);
  }
  if (!root) throw new Error('No website was found in the uploaded folders. Include index.html or a supported package.json project; source files alone may require a build.');
  const notes = [`Website root detected: ${relativeName(base, root.directory)}`];
  const detected = root.packageApp ? await detectFramework(root.directory) : undefined;
  const runtimeRequired = settings.framework !== 'static' && Boolean(detected?.dynamic && root.buildSource);
  const needsCommand = Boolean(settings.buildCommand || settings.installCommand);
  let output: DirectoryRecord | undefined;
  if (settings.outputDirectory) {
    const target = settings.outputDirectory === '.' ? root.directory : safePath(root.directory, settings.outputDirectory);
    output = records.find(record => record.directory === target);
    if (!output && !root.packageApp) throw new Error(`Output directory '${settings.outputDirectory}' was not found under '${relativeName(base, root.directory)}'.`);
  } else if (root.packageApp) {
    // Public is an input folder in React/Vite/Next projects, not their generated output.
    const generated = runtimeRequired ? [] : records.filter(record => {
      if (!record.entry || record.directory === root!.directory || !isWithin(root!.directory, record.directory)) return false;
      const relative = relativeName(root!.directory, record.directory);
      return ['dist', 'build', 'out', 'site'].includes(relative.split('/')[0]) || relative === '.output/public';
    });
    let candidates = outermost(generated);
    const browsers = candidates.filter(record => path.basename(record.directory) === 'browser');
    if (browsers.length === 1) candidates = browsers;
    if (candidates.length > 1) ambiguous(base, candidates, 'generated output folders');
    output = candidates[0];
    if (!output && !runtimeRequired && (!root.buildSource || settings.framework === 'static') && root.entry && !needsCommand) output = root;
  } else {
    output = root.entry ? root : chooseStatic(base, records.filter(record => isWithin(root!.directory, record.directory)));
  }
  if (output?.entry && !needsCommand && !runtimeRequired) {
    const boundary = root.packageApp || settings.outputDirectory ? output.directory : explicitRoot ? root.directory : base;
    const publish = await completePublishFolder(output.directory, output.entry, boundary);
    const entryFile = publish.entry;
    const relativeOutput = relativeName(root.directory, publish.directory);
    notes.push(`Publish directory detected: ${relativeName(base, publish.directory)} (${entryFile})`);
    if (publish.directory !== output.directory) notes.push('Included parent assets and preserved their original folder layout.');
    if (entryFile !== 'index.html') notes.push(`The artifact will expose ${entryFile} as index.html; uploaded source and asset paths stay intact.`);
    return { projectRoot: root.directory, staticDirectory: publish.directory, entryFile, rootDirectory: relativeName(base, root.directory), outputDirectory: relativeOutput, prebuilt: root.packageApp && output.directory !== root.directory, notes };
  }
  if (!root.packageApp && !needsCommand) throw new Error('The selected output folder does not contain website entry HTML. Choose a folder containing index.html or upload a complete build output.');
  notes.push('Source project detected; installation and build require the isolated worker.');
  return { projectRoot: root.directory, rootDirectory: relativeName(base, root.directory), outputDirectory: settings.outputDirectory, prebuilt: false, notes };
}
