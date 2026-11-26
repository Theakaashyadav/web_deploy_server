import { spawnSync } from 'node:child_process';
import { existsSync, copyFileSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { anchorToRepository, resolveLocalDataDirectory } from './local-runtime.mjs';
anchorToRepository();
if (!existsSync('.env')) copyFileSync('.env.example', '.env');
config({ quiet: true });
if (!process.env.ENCRYPTION_KEY) {
  const key = randomBytes(32).toString('hex');
  const existing = readFileSync('.env', 'utf8');
  const updated = /^ENCRYPTION_KEY=.*$/m.test(existing) ? existing.replace(/^ENCRYPTION_KEY=.*$/m, `ENCRYPTION_KEY=${key}`) : `${existing}\nENCRYPTION_KEY=${key}\n`;
  writeFileSync('.env', updated, {mode: 0o600});
  process.env.ENCRYPTION_KEY = key;
}
if (process.env.NODE_ENV === 'production' || !process.env.DATABASE_URL?.startsWith('file:')) {
  console.error('Local setup requires a SQLite file DATABASE_URL. Use production migrations on the VPS.'); process.exit(1);
}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
mkdirSync(resolveLocalDataDirectory(process.env.DATA_DIR || 'data'), { recursive: true });
if (process.env.DATABASE_URL === 'file:./dev.db') process.env.DATABASE_URL = 'file:../../../data/deployhub.db';
// Prisma's Windows schema engine can fail to initialize an absent SQLite file.
// Resolve relative URLs from the source schema, then create only a missing file.
const schemaDirectory = dirname(fileURLToPath(new URL('../packages/database/prisma/schema.local.prisma', import.meta.url)));
const location = process.env.DATABASE_URL.slice('file:'.length).split('?')[0];
const databasePath = location.startsWith('//')
  ? fileURLToPath(`file:${location}`)
  : resolve(schemaDirectory, location);
resolveLocalDataDirectory(databasePath);
mkdirSync(dirname(databasePath), { recursive: true });
if (!existsSync(databasePath)) writeFileSync(databasePath, '', { flag: 'wx', mode: 0o600 });
if (process.platform === 'win32' && location.startsWith('//')) {
  process.env.DATABASE_URL = `file:${databasePath.replaceAll('\\', '/')}`;
}
for (const task of ['generate', 'push']) {
  const run = spawnSync(npm, ['run', task, '-w', '@deployhub/database'], { stdio: 'inherit', shell: process.platform === 'win32', env: process.env });
  if (run.status !== 0) process.exit(run.status ?? 1);
}
console.log(`Local database configured. Run npm run dev, then open http://localhost:${process.env.DASHBOARD_PORT || 3100} to create your administrator.`);
