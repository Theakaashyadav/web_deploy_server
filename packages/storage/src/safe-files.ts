import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import yauzl from 'yauzl';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { config } from '../../shared/src/config.js';

export function safePath(root: string, relative: string) {
  if (!relative || relative.includes('\0') || relative.includes('\\') || relative.startsWith('/') || /^[a-z]:/i.test(relative) || relative.split('/').some(p => p === '..' || p === '.git')) throw new Error('Unsafe file path');
  const target = path.resolve(root, relative);
  const rel = path.relative(path.resolve(root), target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Path escapes project directory');
  return target;
}

export async function extractZip(archive: string, destination: string) {
  await fsp.mkdir(destination, { recursive: true });
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => yauzl.open(archive, { lazyEntries: true, decodeStrings: true, validateEntrySizes: true }, (e, z) => e ? reject(e) : resolve(z!)));
  let bytes = 0, files = 0, written = 0;
  const seen = new Set<string>();
  await new Promise<void>((resolve, reject) => {
    const fail = (error: Error) => { zip.close(); reject(error); };
    zip.on('error', fail);
    zip.on('end', resolve);
    zip.on('entry', async (entry: yauzl.Entry) => {
      try {
        const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
        if (mode === 0o120000 || (mode && ![0o100000, 0o040000].includes(mode))) throw new Error('Archive symbolic links and special files are forbidden');
        const target = safePath(destination, entry.fileName);
        if (seen.has(target.toLowerCase())) throw new Error('Duplicate archive path');
        seen.add(target.toLowerCase());
        files++;
        bytes += entry.uncompressedSize;
        if (files > config.maxFiles || bytes > config.maxExtractedBytes || (entry.uncompressedSize > 1048576 && entry.uncompressedSize / Math.max(1,entry.compressedSize) > 1000)) throw new Error('Archive exceeds extraction limits');
        if (entry.fileName.endsWith('/')) await fsp.mkdir(target, { recursive: true });
        else {
          await fsp.mkdir(path.dirname(target), { recursive: true });
          const stream = await new Promise<NodeJS.ReadableStream>((res, rej) => zip.openReadStream(entry, (e, s) => e ? rej(e) : res(s!)));
          const limiter = new Transform({ transform(chunk, _encoding, cb) { written += chunk.length; cb(written > config.maxExtractedBytes ? new Error('Archive expanded beyond allowed size') : null, chunk); } });
          await pipeline(stream as fs.ReadStream, limiter, fs.createWriteStream(target, { flags: 'wx', mode: 0o644 }));
        }
        zip.readEntry();
      } catch (error) { fail(error as Error); }
    });
    zip.readEntry();
  });
  return { bytes: written, files };
}

export async function inventory(root: string, maxBytes = config.maxExtractedBytes) {
  let bytes = 0, count = 0;
  const files: string[] = [];
  async function visit(dir: string) {
    for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
      if (++count > config.maxFiles) throw new Error('Too many deployment files');
      const full = path.join(dir, entry.name);
      const stat = await fsp.lstat(full);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error('Symbolic links and special files are forbidden');
      if (stat.isDirectory()) await visit(full);
      else {
        bytes += stat.size;
        if (bytes > maxBytes) throw new Error('Deployment exceeds disk limit');
        files.push(path.relative(root, full).replace(/\\/g, '/'));
      }
    }
  }
  await visit(root);
  return { bytes, files };
}

export async function projectRoot(directory: string) {
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  const meaningful = entries.filter(e => e.name !== '__MACOSX' && e.name !== '.DS_Store');
  if (meaningful.length === 1 && meaningful[0].isDirectory()) return path.join(directory, meaningful[0].name);
  return directory;
}
