import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPortsAvailable, localPorts, repositoryRoot, resolveLocalDataDirectory } from '../scripts/local-runtime.mjs';

test('DeployHub uses dedicated local ports and rejects ambiguous service ports',()=>{
  assert.deepEqual(localPorts({}).map(service=>service.port),[3100,4100,4101]);
  assert.throws(()=>localPorts({DASHBOARD_PORT:'3000',API_PORT:'3000'}),/different port/);
  assert.throws(()=>localPorts({DASHBOARD_PORT:'invalid'}),/integers/);
});

test('local paths belong to DeployHub regardless of the launching terminal directory',()=>{
  assert.equal(path.resolve(repositoryRoot),fileURLToPath(new URL('../',import.meta.url)).replace(/[\\/]$/,''));
  assert.equal(resolveLocalDataDirectory('data'),path.join(repositoryRoot,'data'));
  assert.throws(()=>resolveLocalDataDirectory('../Avynex/data'),/inside this project/);
  assert.throws(()=>resolveLocalDataDirectory('..'),/inside this project/);
});

test('startup refuses an occupied port without touching the existing application',async()=>{
  const existing=net.createServer(socket=>socket.end('existing application'));
  await new Promise<void>(resolve=>existing.listen(0,'127.0.0.1',resolve));
  try {
    const port=(existing.address() as net.AddressInfo).port;
    await assert.rejects(assertPortsAvailable([{name:'dashboard',port}]),/no existing server was stopped/);
    const body=await new Promise<string>((resolve,reject)=>{
      const client=net.connect(port,'127.0.0.1');let data='';client.on('data',chunk=>data+=chunk);client.on('end',()=>resolve(data));client.on('error',reject);
    });
    assert.equal(body,'existing application');
  } finally { await new Promise<void>(resolve=>existing.close(()=>resolve())); }
});
