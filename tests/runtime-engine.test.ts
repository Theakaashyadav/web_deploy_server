import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {config} from '../packages/shared/src/config.js';
import {probeWorkerCapabilities} from '../packages/shared/src/capabilities.js';
import {verifyArtifact} from '../packages/deployment-engine/src/index.js';
import {managedRuntimeDeployments} from '../packages/deployment-engine/src/runtime-recovery.js';

test('worker readiness never reports a configured but absent Docker executable as available',async()=>{
  const previous={binary:process.env.DOCKER_BIN,enabled:process.env.BUILD_DOCKER_ENABLED,network:process.env.BUILD_NETWORK};
  try {
    process.env.DOCKER_BIN=path.resolve('data/nonexistent-deployhub-docker-executable');process.env.BUILD_DOCKER_ENABLED='true';process.env.BUILD_NETWORK='bridge';
    const readiness=await probeWorkerCapabilities();assert.equal(readiness.dockerInstalled,false);assert.equal(readiness.sourceBuildsAvailable,false);assert.equal(readiness.dynamicRuntimeAvailable,false);assert.match(readiness.reason!,/Docker is not installed/);
  } finally {for(const [name,value] of Object.entries({DOCKER_BIN:previous.binary,BUILD_DOCKER_ENABLED:previous.enabled,BUILD_NETWORK:previous.network})){if(value===undefined)delete process.env[name];else process.env[name]=value;}}
});

test('runtime recovery only selects generated deployment identities from owned container listings',()=>{
  assert.deepEqual(managedRuntimeDeployments('deployhub-runtime-dpl-123456abcdef|dpl-123456abcdef\ndeployhub-build-dpl-123456abcdef|dpl-123456abcdef\nother-project|dpl-123456abcdef\ndeployhub-runtime-dpl-777777|dpl-888888\npostgres|postgres'),['dpl-123456abcdef']);
});

test('gateway verification accepts locale redirects and rejects cross-origin redirects and loops',async()=>{
  const previous={port:config.runtimePort,domain:config.siteDomain,sitePort:config.sitePort,mode:process.env.NODE_ENV,internal:process.env.RUNTIME_INTERNAL_HOST};
  const id='dpl-123456abcdef';let behavior='locale';const requests:string[]=[];
  const server=http.createServer((request,response)=>{
    requests.push(request.url!);response.setHeader('X-DeployHub-Deployment',id);
    if(behavior==='external'){response.writeHead(302,{Location:'http://unrelated.example/'});return response.end();}
    if(behavior==='loop'||request.url==='/'){response.writeHead(307,{Location:'/en'});return response.end();}
    response.end('<h1>Server-rendered website</h1>');
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    config.runtimePort=(server.address() as import('node:net').AddressInfo).port;config.siteDomain='localhost';config.sitePort='4101';process.env.NODE_ENV='test';process.env.RUNTIME_INTERNAL_HOST='127.0.0.1';
    await verifyArtifact({slug:'redirect-site'},{id});assert.deepEqual(requests,['/','/en']);
    behavior='external';await assert.rejects(verifyArtifact({slug:'redirect-site'},{id}),/different website origin/);
    behavior='loop';await assert.rejects(verifyArtifact({slug:'redirect-site'},{id}),/redirect limit/);
  } finally {
    config.runtimePort=previous.port;config.siteDomain=previous.domain;config.sitePort=previous.sitePort;
    for(const [name,value] of Object.entries({NODE_ENV:previous.mode,RUNTIME_INTERNAL_HOST:previous.internal})){if(value===undefined)delete process.env[name];else process.env[name]=value;}
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});
