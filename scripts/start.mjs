import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const website = path.join(repository, 'apps/dashboard');

export function productionOptions(environment = process.env) {
  const port = Number(environment.PORT || 3100);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535.');
  }
  const hostname = environment.WEBSYNK_HOST?.trim() || '0.0.0.0';
  if (/[\s/\\\0]/.test(hostname)) throw new Error('WEBSYNK_HOST must be a hostname or IP address.');
  return { port, hostname };
}

export function startProduction() {
  const { port, hostname } = productionOptions();
  const require = createRequire(new URL('../apps/dashboard/package.json', import.meta.url));
  const next = require.resolve('next/dist/bin/next');
  const child = spawn(process.execPath, [next, 'start', '--hostname', hostname, '--port', String(port)], {
    cwd: website,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
  });
  const interrupt = () => child.kill('SIGINT');
  const terminate = () => child.kill('SIGTERM');
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  let failed = false;
  child.once('error', error => {
    failed = true;
    console.error(`Could not start Websynk: ${error.message}`);
  });
  child.once('close', (code, signal) => {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', terminate);
    process.exitCode = failed ? 1 : code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1);
  });
  return child;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { startProduction(); }
  catch (error) { console.error(`Could not start Websynk: ${error.message}`); process.exitCode = 1; }
}
