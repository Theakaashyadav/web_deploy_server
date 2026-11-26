import { ZipArchive } from 'archiver';
import ignore from 'ignore';
import { createWriteStream } from 'node:fs';
import { lstat, mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const forbiddenDirectories = new Set(['node_modules', '.git', '.svn', '.hg', '.ssh', '.aws', '.azure', '.gcloud', '.config', '.kube', '.docker', '.terraform', '.codex', '.vercel', '.netlify', '.cache', '.npm-cache', '.pnpm-store', '.parcel-cache', '.turbo', '.local', '.tmp', '.next', '.nuxt', '.deployhub', '.npm', 'backups', 'coverage']);
const forbiddenFiles = /^(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|credentials(?:\..*)?|auth\.json|secrets?\.(?:json|yaml|yml|toml)|service[-_]?account.*\.json|id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?|.*\.(?:pem|key|p12|pfx|keystore|jks|tmp|temp|swp|swo)|\.DS_Store|Thumbs\.db)$/i;

export function mandatoryExcluded(relative: string): boolean {
  const parts = relative.replaceAll('\\', '/').split('/');
  return parts.some(part => forbiddenDirectories.has(part.toLowerCase()) || forbiddenFiles.test(part));
}

export interface PackageResult {
  path: string;
  fileCount: number;
  bytes: number;
  cleanup: () => Promise<void>;
}

/** Never follows symlinks; ignore rules cannot re-include mandatory secret exclusions. */
export async function packageDirectory(directory: string, options: { maxBytes?: number; maxFiles?: number } = {}): Promise<PackageResult> {
  const source = await realpath(directory);
  if (!(await lstat(source)).isDirectory()) throw new Error('Deployment source must be a directory.');
  const rules = ignore();
  try { rules.add(await readFile(path.join(source, '.deployhubignore'), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const workspace = await mkdtemp(path.join(tmpdir(), 'deployhub-'));
  const archivePath = path.join(workspace, 'website.zip');
  let bytes = 0;
  let fileCount = 0;
  const files: { absolute: string; relative: string }[] = [];
  const walk = async (folder: string): Promise<void> => {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const absolute = path.join(folder, entry.name);
      const relative = path.relative(source, absolute).split(path.sep).join('/');
      if (mandatoryExcluded(relative) || rules.ignores(relative + (entry.isDirectory() ? '/' : ''))) continue;
      if (relative.length > 1024) throw new Error('File path exceeds 1024 characters.');
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) throw new Error(`Symbolic links are not allowed: ${relative}`);
      if (info.isDirectory()) await walk(absolute);
      else if (info.isFile()) {
        bytes += info.size;
        fileCount++;
        if (bytes > (options.maxBytes ?? 250 * 1024 * 1024)) throw new Error('Project exceeds the 250 MiB upload limit.');
        if (fileCount > (options.maxFiles ?? 10000)) throw new Error('Project exceeds the 10,000-file limit.');
        files.push({ absolute, relative });
      } else throw new Error(`Unsupported special file: ${relative}`);
    }
  };
  try {
    await walk(source);
    if (!files.length) throw new Error('No deployable files remain after applying ignore rules.');
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(archivePath, { mode: 0o600 });
      const archive = new ZipArchive({ zlib: { level: 6 } });
      output.on('close', resolve);
      output.on('error', reject);
      archive.on('error', reject);
      archive.on('warning', reject);
      archive.pipe(output);
      for (const file of files) archive.file(file.absolute, { name: file.relative });
      void archive.finalize().catch(reject);
    });
    return { path: archivePath, bytes, fileCount, cleanup: () => rm(workspace, { recursive: true, force: true }) };
  } catch (error) {
    await rm(workspace, { recursive: true, force: true });
    throw error;
  }
}
