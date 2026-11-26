import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { isAbsolute, relative, resolve } from 'node:path';

export const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
export function anchorToRepository() { process.chdir(repositoryRoot); }

export function localPorts(environment = process.env) {
  const ports = [
    { name: 'dashboard', port: Number(environment.DASHBOARD_PORT || 3100) },
    { name: 'API', port: Number(environment.API_PORT || 4100) },
    { name: 'website runtime', port: Number(environment.RUNTIME_PORT || 4101) },
  ];
  if (ports.some(({port}) => !Number.isInteger(port) || port < 1024 || port > 65535)) throw new Error('DeployHub local ports must be integers between 1024 and 65535.');
  if (new Set(ports.map(({port})=>port)).size !== ports.length) throw new Error('Each DeployHub service needs a different port.');
  return ports;
}

export function resolveLocalDataDirectory(value = 'data') {
  const target = resolve(repositoryRoot, value);
  const location = relative(repositoryRoot, target);
  if (!location || location === '..' || location.startsWith('../') || location.startsWith('..\\') || isAbsolute(location)) {
    throw new Error('Local DeployHub DATA_DIR must be a dedicated directory inside this project.');
  }
  return target;
}

export async function assertPortsAvailable(ports) {
  for (const {name,port} of ports) {
    // Check both loopback families: another app can occupy IPv4 while localhost uses IPv6.
    for (const host of ['127.0.0.1', '::1']) {
      await new Promise((resolvePromise,reject)=>{
        const probe=net.createServer();
        probe.once('error',error=>{
          if (['EAFNOSUPPORT','EADDRNOTAVAIL'].includes(error.code)) return resolvePromise();
          reject(new Error(`DeployHub ${name} port ${port} is unavailable on ${host}. Another application may be using it. Stop that application yourself or set a different DeployHub port; no existing server was stopped.`));
        });
        probe.listen({port,host,exclusive:true},()=>probe.close(error=>error ? reject(error) : resolvePromise()));
      });
    }
  }
}
