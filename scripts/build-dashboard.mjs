import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const dashboardDirectory = fileURLToPath(new URL('../apps/dashboard/', import.meta.url));
const require = createRequire(new URL('../apps/dashboard/package.json', import.meta.url));
let nextCli;
try {
  nextCli = require.resolve('next/dist/bin/next');
} catch (error) {
  console.error(`Cannot find the dashboard's Next.js installation. Run npm ci from the repository root. ${error.message}`);
  process.exit(1);
}

// Restricted hosting can prevent Turbopack's CSS worker from starting.
// Set the standard production mode explicitly and keep the build in its workspace.
const child = spawn(process.execPath, [nextCli, 'build', '--webpack', ...process.argv.slice(2)], {
  cwd: dashboardDirectory,
  env: { ...process.env, NODE_ENV: 'production' },
  stdio: 'inherit',
  shell: false,
});
let spawnFailed = false;
const onInterrupt = () => child.kill('SIGINT');
const onTerminate = () => child.kill('SIGTERM');
process.on('SIGINT', onInterrupt);
process.on('SIGTERM', onTerminate);
child.once('error', error => {
  spawnFailed = true;
  console.error(`Could not start the dashboard build: ${error.message}`);
});
child.once('close', (code, signal) => {
  process.removeListener('SIGINT', onInterrupt);
  process.removeListener('SIGTERM', onTerminate);
  process.exitCode = spawnFailed ? 1 : code !== null && code >= 0 ? code : signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1;
});
