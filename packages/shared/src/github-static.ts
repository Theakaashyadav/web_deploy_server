/** GitHub-backed static hosting. Source and assets are fetched in memory, never cloned or written to disk. */
export type GitHubStaticSource = {
  repository: string;
  owner: string;
  repo: string;
  branch: string;
  commit: string;
  directory: string;
};

export type GitHubFetchOptions = {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  maxBytes?: number;
  validationTimeoutMs?: number;
};
type OperationOptions = GitHubFetchOptions & { deadlineMs?: number };

const readinessOptions = (options: OperationOptions): OperationOptions => ({
  ...options, deadlineMs: options.deadlineMs ?? Date.now() + (options.validationTimeoutMs ?? 60000),
});

export type GitHubStaticFile = { status: number; body: Buffer; contentType: string; etag?: string };

const assetLimit = 20 * 1024 * 1024;
const htmlLimit = 8 * 1024 * 1024;
const metadataLimit = 1024 * 1024;
const types: Record<string, string> = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8', map: 'application/json; charset=utf-8', webmanifest: 'application/manifest+json',
  txt: 'text/plain; charset=utf-8', xml: 'application/xml; charset=utf-8', csv: 'text/csv; charset=utf-8',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon', bmp: 'image/bmp',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject',
  mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mp3: 'audio/mpeg', ogg: 'audio/ogg',
  wav: 'audio/wav', m4a: 'audio/mp4', vtt: 'text/vtt; charset=utf-8', pdf: 'application/pdf', wasm: 'application/wasm',
};
const blockedNames = /^(?:package(?:-lock)?\.json|npm-shrinkwrap\.json|(?:pnpm-lock|yarn)\..*|(?:Dockerfile|docker-compose\..*)|AGENTS\.md)$/i;

export function parseGitHubRepository(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Enter a public GitHub repository URL, such as https://github.com/owner/website.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash) {
    throw new Error('Only public https://github.com/owner/repository URLs without credentials or query parameters are supported.');
  }
  const parts = url.pathname.replace(/\/$/, '').split('/');
  if (parts.length !== 3 || parts[0] !== '') throw new Error('Use the repository URL; enter the branch and static directory separately.');
  const owner = parts[1], repo = parts[2].replace(/\.git$/, '');
  if (!/^[a-z\d][a-z\d-]{0,38}$/i.test(owner) || !/^[a-z\d_.-]{1,100}$/i.test(repo) || ['.', '..'].includes(repo)) {
    throw new Error('The GitHub repository owner or name is invalid.');
  }
  return { repository: `https://github.com/${owner}/${repo}`, owner, repo };
}

export function normalizeGitHubBranch(value: string) {
  const branch = value.trim();
  if (!branch || branch.length > 200 || /[\s\x00-\x1f\x7f~^:?*\[\\%]/.test(branch) || branch.includes('..') || branch.includes('@{') || branch === '@' || branch.startsWith('/') || branch.endsWith('/') || branch.endsWith('.')) {
    throw new Error('Enter a valid GitHub branch or commit.');
  }
  if (branch.split('/').some(part => !part || part.startsWith('.') || part.endsWith('.lock'))) throw new Error('Enter a valid GitHub branch or commit.');
  return branch;
}

function safeSegments(value: string) {
  if (value.length > 1500 || /[\x00-\x1f\x7f\\%?#:]/.test(value) || value.startsWith('/')) throw new Error('Unsafe static file path.');
  const segments = value.split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..' || (segment.startsWith('.') && segment !== '.well-known') || ['node_modules', '.git'].includes(segment.toLowerCase()))) throw new Error('Unsafe static file path.');
  return segments;
}

export function normalizeGitHubDirectory(value = '.') {
  if (!value || value === '.') return '.';
  return safeSegments(value.replace(/\/$/, '')).join('/');
}

export function normalizeGitHubFilePath(value: string) {
  const file = !value ? 'index.html' : value.endsWith('/') ? value + 'index.html' : value;
  const segments = safeSegments(file);
  const name = segments.at(-1)!;
  if (blockedNames.test(name) || !types[name.split('.').at(-1)!.toLowerCase()]) throw new Error('Only browser-ready static website files can be served.');
  return segments.join('/');
}

export function assertGitHubStaticSource(value: unknown): asserts value is GitHubStaticSource {
  if (!value || typeof value !== 'object') throw new Error('Invalid GitHub static source.');
  const source = value as GitHubStaticSource;
  if (typeof source.repository !== 'string' || typeof source.branch !== 'string' || typeof source.directory !== 'string' || typeof source.commit !== 'string' || !/^[a-f\d]{40}$/i.test(source.commit)) throw new Error('Invalid GitHub static source.');
  const repository = parseGitHubRepository(source.repository);
  if (source.owner !== repository.owner || source.repo !== repository.repo || source.repository !== repository.repository || normalizeGitHubDirectory(source.directory) !== source.directory || normalizeGitHubBranch(source.branch) !== source.branch) throw new Error('Invalid GitHub static source.');
}

async function request(url: string, options: OperationOptions, maxBytes: number) {
  const remaining = options.deadlineMs === undefined ? Infinity : options.deadlineMs - Date.now();
  if (remaining <= 0) throw new Error('GitHub static validation exceeded its total time budget.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(options.timeoutMs ?? 15000, remaining));
  try {
    const response = await (options.fetch ?? globalThis.fetch)(url, {
      redirect: 'error', credentials: 'omit', signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'DeployHub-Static', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    const limit = Math.min(options.maxBytes ?? maxBytes, maxBytes);
    if (Number(response.headers.get('content-length')) > limit) {
      await response.body?.cancel();
      throw new Error('The GitHub response exceeds the static file size limit.');
    }
    const chunks: Uint8Array[] = []; let size = 0;
    const reader = response.body?.getReader();
    if (reader) {
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.length;
          if (size > limit) { await reader.cancel(); throw new Error('The GitHub response exceeds the static file size limit.'); }
          chunks.push(chunk.value);
        }
      } finally { reader.releaseLock(); }
    }
    return { response, body: Buffer.concat(chunks, size) };
  } catch (error) {
    if (controller.signal.aborted) throw new Error('GitHub did not respond before the static request timed out.');
    throw error;
  } finally { clearTimeout(timeout); }
}

function upstreamError(status: number): never {
  if (status === 403 || status === 429) throw new Error('GitHub refused this request or its public request limit was reached. Try again later.');
  if (status === 404) throw new Error('The public GitHub repository, branch, or static directory was not found. Private repositories are not supported.');
  throw new Error(`GitHub returned HTTP ${status}; the site was not activated.`);
}

export async function fetchGitHubStaticFile(source: GitHubStaticSource, filePath: string, options: GitHubFetchOptions = {}): Promise<GitHubStaticFile> {
  assertGitHubStaticSource(source);
  const file = normalizeGitHubFilePath(filePath);
  const segments = [source.owner, source.repo, source.commit, ...(source.directory === '.' ? [] : source.directory.split('/')), ...file.split('/')];
  const { response, body } = await request(`https://raw.githubusercontent.com/${segments.map(encodeURIComponent).join('/')}`, options, /\.html?$/i.test(file) ? htmlLimit : assetLimit);
  if (response.status !== 404 && !response.ok) upstreamError(response.status);
  return { status: response.status, body, contentType: types[file.split('.').at(-1)!.toLowerCase()], ...(response.headers.get('etag') ? { etag: response.headers.get('etag')! } : {}) };
}

const attribute = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find(value => value !== undefined);

/** Check entry HTML and direct local assets without executing JavaScript or build commands. */
export async function validateGitHubStaticHtml(source: GitHubStaticSource, html: string, options: GitHubFetchOptions = {}) {
  const bounded = readinessOptions(options);
  if (!html.trim() || !/<!doctype\s+html\b|<[a-z][a-z\d]*(?:\s|>|\/)/i.test(html)) throw new Error('index.html must contain a non-empty, ready HTML document.');
  if (/%(?:PUBLIC_URL|BASE_URL|VITE_[A-Z\d_]+)%|\/@vite\/client|<%/.test(html)) throw new Error('index.html is an unbuilt framework template and needs a build. Commit the generated static output first.');
  const origin = 'https://deployhub-static.invalid';
  let base = new URL('/', origin);
  const baseTag = html.match(/<base\b[^>]*>/i)?.[0], baseHref = baseTag && attribute(baseTag, 'href');
  if (baseHref) {
    try { base = new URL(baseHref, base); } catch { throw new Error('The entry HTML contains an invalid base URL.'); }
  }
  const files = new Map<string, boolean>();
  for (const tag of html.match(/<(?:script|link|img|source|video|audio)\b[^>]*>/gi) ?? []) {
    const link = /^<link\b/i.test(tag);
    if (link && !/\b(?:stylesheet|icon|modulepreload)\b/i.test(attribute(tag, 'rel') || '')) continue;
    for (const raw of [attribute(tag, link ? 'href' : 'src'), attribute(tag, 'poster')]) {
      if (!raw || raw.startsWith('#') || /^(?:data|blob):/i.test(raw)) continue;
      let url: URL;
      try { url = new URL(raw.replaceAll('&amp;', '&'), base); } catch { throw new Error('The entry HTML contains an invalid asset URL.'); }
      if (url.origin !== origin) continue;
      const file = normalizeGitHubFilePath(decodeURIComponent(url.pathname.slice(1)));
      if (/^<script\b/i.test(tag) && !/\.m?js$/i.test(file)) throw new Error('The entry HTML references unbuilt JavaScript source. Commit the generated static output first.');
      const module = /^<script\b/i.test(tag) && attribute(tag, 'type')?.toLowerCase() === 'module' || link && /\bmodulepreload\b/i.test(attribute(tag, 'rel') || '');
      files.set(file, files.get(file) === true || module);
      if (files.size > 100) throw new Error('The entry HTML references too many direct assets (maximum 100).');
    }
  }
  const importMap = /<script\b[^>]*\btype\s*=\s*["']?importmap\b/i.test(html);
  for (const [file, module] of files) {
    const result = await fetchGitHubStaticFile(source, file, bounded);
    if (result.status !== 200) throw new Error(`A static asset referenced by index.html was not found: ${file}. Select the complete generated website directory.`);
    if (result.body.subarray(0, 200).toString('utf8').startsWith('version https://git-lfs.github.com/spec/v1')) throw new Error(`The static asset ${file} is a Git LFS pointer. Commit its actual website bytes to the public static directory.`);
    if (/\.m?js$/i.test(file) && result.body.length <= 1048576) {
      const javascript = result.body.toString('utf8');
      // Ignore literals and comments when checking for JSX that browsers cannot execute.
      const executable = javascript.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, match => ' '.repeat(match.length));
      if (/(?:\breturn\b|=>|[=(,?:])\s*<(?:[a-z][\w.:-]*(?:\s|\/?>)|>)/i.test(executable)) throw new Error(`The JavaScript asset ${file} contains unbuilt JSX. Commit generated browser-ready JavaScript first.`);
      const imports = module && !importMap ? [...javascript.matchAll(/\b(?:import\s*(?:[^;\n]*?\sfrom\s*)?|export\s+[^;\n]*?\sfrom\s*)["']([^"']+)["']/g)] : [];
      if (imports.some(match => !/^(?:[./]|[a-z][a-z\d+.-]*:)/i.test(match[1]))) throw new Error(`The module ${file} imports a package that needs bundling. Commit built static output or provide a browser importmap.`);
    }
  }
}

export async function resolveGitHubStaticSource(input: { repository: string; branch?: string; directory?: string }, options: GitHubFetchOptions = {}): Promise<GitHubStaticSource> {
  const bounded = readinessOptions(options);
  const repository = parseGitHubRepository(input.repository.trim());
  const directory = normalizeGitHubDirectory(input.directory?.trim());
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}`;
  let branch = input.branch?.trim();
  if (branch) branch = normalizeGitHubBranch(branch);
  else {
    const { response, body } = await request(endpoint, bounded, metadataLimit);
    if (!response.ok) upstreamError(response.status);
    let metadata: { private?: boolean; default_branch?: string };
    try { metadata = JSON.parse(body.toString('utf8')); } catch { throw new Error('GitHub returned invalid repository metadata.'); }
    if (metadata.private || typeof metadata.default_branch !== 'string') throw new Error('A public GitHub repository with a default branch is required.');
    branch = normalizeGitHubBranch(metadata.default_branch);
  }
  const { response, body } = await request(`${endpoint}/commits/${encodeURIComponent(branch)}`, bounded, metadataLimit);
  if (!response.ok) upstreamError(response.status);
  let commit: string;
  try { commit = JSON.parse(body.toString('utf8')).sha; } catch { throw new Error('GitHub returned invalid commit metadata.'); }
  if (typeof commit !== 'string' || !/^[a-f\d]{40}$/i.test(commit)) throw new Error('GitHub did not return an immutable commit.');
  const source: GitHubStaticSource = { ...repository, branch, commit: commit.toLowerCase(), directory };
  const entry = await fetchGitHubStaticFile(source, 'index.html', bounded);
  if (entry.status !== 200) throw new Error('No index.html was found in the selected GitHub directory. Commit ready static output or publish it to a branch using GitHub Actions.');
  await validateGitHubStaticHtml(source, entry.body.toString('utf8'), bounded);
  return source;
}
