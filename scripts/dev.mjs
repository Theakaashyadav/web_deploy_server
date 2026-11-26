import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { anchorToRepository, assertPortsAvailable, localPorts, resolveLocalDataDirectory } from './local-runtime.mjs';
anchorToRepository();
config({ path: resolve('.env'), quiet: true });
process.env.DATA_DIR = resolveLocalDataDirectory(process.env.DATA_DIR || 'data');
const ports = localPorts();
process.env.API_PORT ||= String(ports[1].port);
process.env.RUNTIME_PORT ||= String(ports[2].port);
process.env.SITE_PORT ||= String(ports[2].port);
process.env.DASHBOARD_ORIGIN ||= `http://localhost:${ports[0].port}`;
process.env.API_ORIGIN ||= `http://127.0.0.1:${ports[1].port}`;
if (process.env.DATABASE_URL === 'file:./dev.db') process.env.DATABASE_URL = 'file:../../../data/deployhub.db';
if (!existsSync('node_modules/.prisma/client/index.js')) {
  console.error('Run npm install, then npm run setup first.'); process.exit(1);
}
try { await assertPortsAvailable(ports); }
catch(error) { console.error(error.message); process.exit(1); }
console.log(`DeployHub dashboard: http://localhost:${ports[0].port}`);
console.log(`DeployHub API: http://localhost:${ports[1].port}; websites: http://<slug>.localhost:${ports[2].port}`);
const children = [];
function launch(args, cwd = process.cwd()) {
  const child = spawn(process.execPath, args, { cwd, stdio: 'inherit', env: process.env });
  children.push(child);
  child.on('exit', code => { if (code && !closing) { console.error(`Service exited (${code}).`); close(code); } });
}
let closing = false;
function close(code = 0) {
  if (closing) return; closing = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 1000).unref();
}
process.on('SIGINT', () => close()); process.on('SIGTERM', () => close());
launch(['--import', 'tsx', 'apps/api/src/index.ts']);
launch(['--import', 'tsx', 'apps/worker/src/runtime.ts']);
launch(['--import', 'tsx', 'apps/worker/src/index.ts']);
launch([resolve('node_modules/next/dist/bin/next'), 'dev', '--hostname', 'localhost', '--port', String(ports[0].port)], resolve('apps/dashboard'));
