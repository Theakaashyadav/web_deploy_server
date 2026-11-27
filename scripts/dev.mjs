import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repository = fileURLToPath(new URL('../', import.meta.url));
const production = process.argv.includes('--production');
const port = Number(process.env.PORT || 3100);
if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 3000) throw new Error('Use an available Websynk port from 1024 to 65535, excluding the separate project port3000.');
for (const hostname of ['127.0.0.1', '::1']) await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', error => ['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(error.code) ? resolve() : reject(new Error(`Port ${port} is occupied. Choose another PORT; no existing process was stopped.`)));
  probe.listen(port, hostname, () => probe.close(resolve));
});
const child = spawn(process.execPath, [path.join(repository, 'node_modules/next/dist/bin/next'), production ? 'start' : 'dev', ...(production ? [] : ['--webpack']), '--hostname', '127.0.0.1', '--port', String(port)], { cwd: path.join(repository, 'apps/dashboard'), env: process.env, stdio: 'inherit', windowsHide: true });
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code || 0; });
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
