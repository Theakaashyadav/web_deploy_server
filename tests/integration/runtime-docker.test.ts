import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {config} from '../../packages/shared/src/config.js';
import {buildAndStartRuntime,ensureRuntime,runtimeDockerAvailable,runtimeNames,stopRuntime} from '../../packages/runtime-adapters/src/index.js';

// Deliberately opt-in: this creates only uniquely labelled disposable Docker resources.
test('real Docker Node runtime serves redirects and preserves its private SQLite volume across container recreation',{
  skip:process.env.RUN_RUNTIME_DOCKER_TESTS!=='1'?'Requires RUN_RUNTIME_DOCKER_TESTS=1 and a Linux Docker engine; no container execution is claimed by the normal local suite.':false,
  timeout:600000,
},async t=>{
  const available=await runtimeDockerAvailable();assert.equal(available.available,true,available.reason);
  const id='dpl-'+randomBytes(6).toString('hex'),projectId='test-'+randomBytes(8).toString('hex'),installationId='runtime-test-'+randomBytes(8).toString('hex');
  const names=runtimeNames(id,projectId,'preview'),workspace=path.join(config.workspaces,id),source=path.join(workspace,'source'),artifact=path.join(config.artifacts,id);
  const previous={enabled:process.env.BUILD_DOCKER_ENABLED,network:process.env.BUILD_NETWORK,gateway:process.env.RUNTIME_DOCKER_GATEWAY};
  process.env.BUILD_DOCKER_ENABLED='true';process.env.BUILD_NETWORK='none';process.env.RUNTIME_DOCKER_GATEWAY=previous.gateway==='network'?'network':'host';
  const command=(args:string[])=>new Promise<string>((resolve,reject)=>{
    const child=spawn(process.env.DOCKER_BIN||'docker',args,{stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',data=>out+=data);child.stderr.on('data',data=>err+=data);child.on('error',reject);child.on('close',code=>code===0?resolve(out.trim()):reject(new Error(err)));
  });
  t.after(async()=>{
    // stopRuntime validates the generated container prefix and DeployHub ownership labels.
    await stopRuntime(id,{removeImage:true});
    const label=await command(['volume','inspect','--format','{{index .Labels "io.deployhub.installation"}}',names.volume]).catch(()=>'');
    if(label===installationId)await command(['volume','rm',names.volume]).catch(()=>{});
    await fs.rm(workspace,{recursive:true,force:true});await fs.rm(artifact,{recursive:true,force:true});
    for(const [key,value] of [['BUILD_DOCKER_ENABLED',previous.enabled],['BUILD_NETWORK',previous.network],['RUNTIME_DOCKER_GATEWAY',previous.gateway]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}
  });
  await fs.mkdir(source,{recursive:true});
  await fs.writeFile(path.join(source,'init.mjs'),`import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync(new URL(process.env.DATABASE_URL).pathname);db.exec('CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY,value INTEGER NOT NULL);INSERT OR IGNORE INTO counter VALUES (1,0)');db.close();`);
  await fs.writeFile(path.join(source,'build.mjs'),`import fs from 'node:fs';if(process.env.NODE_ENV!=='production')throw new Error('Application builds must use production mode');fs.writeFileSync('build-info.json',JSON.stringify({environment:process.env.NODE_ENV}));`);
  await fs.writeFile(path.join(source,'server.mjs'),`import http from 'node:http';import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';const built=JSON.parse(fs.readFileSync('build-info.json','utf8'));const db=new DatabaseSync(new URL(process.env.DATABASE_URL).pathname);http.createServer((request,response)=>{if(request.url==='/'){response.writeHead(307,{Location:'/en'});return response.end();}if(request.method==='POST')db.exec('UPDATE counter SET value=value+1 WHERE id=1');response.setHeader('Content-Type','application/json');response.end(JSON.stringify({message:'Isolated Node SSR fixture',buildEnvironment:built.environment,value:db.prepare('SELECT value FROM counter WHERE id=1').get().value}));}).listen(Number(process.env.PORT),'0.0.0.0');`);
  const log:string[]=[];
  const result=await buildAndStartRuntime({id,projectId,installationId,environment:'preview',appUrl:'http://fixture.localhost:4101',sourceDirectory:source,framework:'node',installCommand:'',buildCommand:'node build.mjs',startCommand:'node server.mjs',variables:{},database:{provider:'sqlite',hasMigrations:false,migrationCommand:'node init.mjs'},onLog:message=>{log.push(message);}});
  assert.equal((await fetch(result.endpoint,{redirect:'manual'})).status,307);
  let response=await fetch(result.endpoint+'/en',{method:'POST'});assert.equal(response.status,200);const initial=await response.json();assert.equal(initial.value,1);assert.equal(initial.buildEnvironment,'production');
  assert.ok((await fs.stat(path.join(result.path,'image.tar'))).size>0);
  await stopRuntime(id);
  const endpoint=await ensureRuntime({runtimeImage:result.image,runtimeContainer:result.container,runtimeEndpoint:result.endpoint,path:result.path});
  response=await fetch(endpoint+'/en');assert.equal((await response.json()).value,1,'The private volume must survive recreation.');
  assert.ok(!log.some(line=>line.includes('uploaded Dockerfile')));
});
