import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';
import http from 'node:http';
import { safePath, extractZip } from '../packages/storage/src/safe-files.js';
import { detectFramework } from '../packages/framework-adapters/src/index.js';
import { slugify, runtimeProductionUrl as productionUrl, runtimePreviewUrl as previewUrl, config } from '../packages/shared/src/config.js';
import { isolatedBuildArguments, redact,verifyArtifact } from '../packages/deployment-engine/src/index.js';
import { encryptSecret,decryptSecret } from '../packages/shared/src/secrets.js';

function crc32(buffer:Buffer) {let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function zipEntry(name:string,content:Buffer,mode=0o100644,compress=false) {
  const filename=Buffer.from(name),data=compress?deflateRawSync(content):content,crc=crc32(content),method=compress?8:0;
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(method,8);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(content.length,22);local.writeUInt16LE(filename.length,26);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(0x0314,4);central.writeUInt16LE(20,6);central.writeUInt16LE(method,10);central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(content.length,24);central.writeUInt16LE(filename.length,28);central.writeUInt32LE((mode<<16)>>>0,38);
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+filename.length,12);end.writeUInt32LE(local.length+filename.length+data.length,16);
  return Buffer.concat([local,filename,data,central,filename,end]);
}
async function temporary(fn:(directory:string)=>Promise<void>) {const directory=await fs.mkdtemp(path.join(os.tmpdir(),'deployhub-test-'));try{await fn(directory);}finally{await fs.rm(directory,{recursive:true,force:true});}}

test('project paths reject Windows, POSIX and encoded null traversal',()=>{
  for(const unsafe of ['../escape','/etc/passwd','C:/private','a\\..\\escape','a/../../escape','bad\0file','a/.git/config'])assert.throws(()=>safePath('/project',unsafe));
  assert.equal(safePath(path.resolve('project'),'assets/app.js'),path.resolve('project/assets/app.js'));
});
test('ZIP extraction writes an actual website and rejects traversal without escaping',async()=>temporary(async directory=>{
  const archive=path.join(directory,'site.zip'),output=path.join(directory,'output');
  await fs.writeFile(archive,zipEntry('index.html',Buffer.from('<h1>Hello</h1>')));
  await extractZip(archive,output);assert.equal(await fs.readFile(path.join(output,'index.html'),'utf8'),'<h1>Hello</h1>');
  await fs.writeFile(archive,zipEntry('../escaped.html',Buffer.from('bad')));
  await assert.rejects(extractZip(archive,path.join(directory,'unsafe')));
  assert.equal(await fs.access(path.join(directory,'escaped.html')).then(()=>true,()=>false),false);
}));
test('ZIP symlinks, compression bombs and extraction budget overruns are rejected',async()=>temporary(async directory=>{
  const archive=path.join(directory,'site.zip');
  await fs.writeFile(archive,zipEntry('linked',Buffer.from('../../outside'),0o120777));
  await assert.rejects(extractZip(archive,path.join(directory,'symlink')),/links|special/);
  await fs.writeFile(archive,zipEntry('bomb.txt',Buffer.alloc(2*1024*1024,65),0o100644,true));
  await assert.rejects(extractZip(archive,path.join(directory,'bomb')),/limits/);
  const old=config.maxExtractedBytes;config.maxExtractedBytes=10;
  try{await fs.writeFile(archive,zipEntry('large.txt',Buffer.alloc(11)));await assert.rejects(extractZip(archive,path.join(directory,'size')),/limits/);}finally{config.maxExtractedBytes=old;}
}));
test('framework detection distinguishes static, Vite, Next export and server runtimes',async()=>temporary(async directory=>{
  assert.equal((await detectFramework(directory)).framework,'static');
  await fs.writeFile(path.join(directory,'package.json'),JSON.stringify({devDependencies:{vite:'1'},scripts:{build:'vite build'}}));
  const vite=await detectFramework(directory);assert.equal(vite.framework,'vite');assert.equal(vite.outputDirectory,'dist');assert.equal(vite.dynamic,false);
  await fs.writeFile(path.join(directory,'pnpm-lock.yaml'),'lockfileVersion: 9');assert.equal((await detectFramework(directory)).packageManager,'pnpm');
  await fs.writeFile(path.join(directory,'package.json'),JSON.stringify({dependencies:{next:'1'}}));assert.equal((await detectFramework(directory)).dynamic,true);
  await fs.writeFile(path.join(directory,'next.config.mjs'),"export default {output: 'export'}");assert.equal((await detectFramework(directory)).framework,'next-static');
  await fs.writeFile(path.join(directory,'package.json'),'{broken');await assert.rejects(detectFramework(directory),/Invalid package/);
}));
test('URLs retain project origin while previews identify one immutable deployment',()=>{
  const project={slug:slugify('  Client / Portfolio!! ')};assert.equal(project.slug,'client-portfolio');
  assert.match(productionUrl(project),/client-portfolio\./);const first=previewUrl(project,{id:'dpl-a123'}),second=previewUrl(project,{id:'dpl-b456'});assert.notEqual(first,second);assert.equal(new URL(first).hostname.split('.')[0],'client-portfolio--dpl-a123');
  assert.ok(slugify('x'.repeat(100)).length<=35);assert.ok(new URL(previewUrl({slug:slugify('x'.repeat(100))},{id:'dpl-123456789012'})).hostname.split('.')[0].length<=63);
});
test('build invocation enforces non-root isolation and has no host socket mount',()=>{
  const args=isolatedBuildArguments('test','/data/source','/data/output','npm run build');
  assert.equal(args[args.indexOf('--user')+1],'1000:1000');assert.ok(args.includes('--cap-drop=ALL'));assert.ok(args.includes('--security-opt=no-new-privileges'));assert.ok(args.includes('--read-only'));assert.equal(args[args.indexOf('--memory')+1],'768m');assert.equal(args[args.indexOf('--pids-limit')+1],'128');
  assert.ok(args.some(arg=>arg==='type=bind,src=/data/source,dst=/source,readonly'));assert.ok(args.some(arg=>arg.startsWith('/work:rw,nosuid,nodev,size=')));assert.equal(args.some(arg=>arg.includes('docker.sock')||arg==='--privileged'),false);
});
test('deployment logs redact bearer API keys and common secret assignments',()=>{assert.equal(redact('dh_abcdEFG_123 password=very-secret'), '[REDACTED] password=[REDACTED]');});
test('deployment secrets use authenticated randomized encryption and reject tampering',()=>{
  const old=process.env.ENCRYPTION_KEY;process.env.ENCRYPTION_KEY='ab'.repeat(32);
  try{const first=encryptSecret('secret-value'),second=encryptSecret('secret-value');assert.notEqual(first,second);assert.equal(first.includes('secret-value'),false);assert.equal(decryptSecret(first),'secret-value');const [nonce,tag,cipher]=first.split('.');const bytes=Buffer.from(cipher,'base64url');bytes[0]^=1;assert.throws(()=>decryptSecret([nonce,tag,bytes.toString('base64url')].join('.')));delete process.env.ENCRYPTION_KEY;assert.throws(()=>encryptSecret('no-key'),/ENCRYPTION_KEY/);}finally{if(old===undefined)delete process.env.ENCRYPTION_KEY;else process.env.ENCRYPTION_KEY=old;}
});
test('production health checks verify the external URL and exact deployment identity',async()=>{
  const server=http.createServer((_request,response)=>{response.setHeader('X-DeployHub-Deployment','dpl-health');response.end('<h1>healthy</h1>');});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const originalFetch=globalThis.fetch,originalMode=process.env.NODE_ENV,originalHost=process.env.RUNTIME_INTERNAL_HOST;
  const originalPort=config.runtimePort,originalDomain=config.siteDomain;
  config.runtimePort=(server.address() as {port:number}).port;config.siteDomain='sites.example.test';process.env.NODE_ENV='production';process.env.RUNTIME_INTERNAL_HOST='127.0.0.1';
  try{
    let called='';
    globalThis.fetch=async(input,init)=>{called=String(input);assert.equal(init?.redirect,'manual');return new Response('healthy',{status:200,headers:{'X-DeployHub-Deployment':'dpl-health'}});};
    await verifyArtifact({slug:'health-site'},{id:'dpl-health'});assert.match(called,/health-site--dpl-health\.sites\.example\.test/);
    globalThis.fetch=async()=>new Response('wrong artifact',{status:200,headers:{'X-DeployHub-Deployment':'dpl-wrong'}});
    await assert.rejects(verifyArtifact({slug:'health-site'},{id:'dpl-health'}),/Public preview verification failed/);
  }finally{
    globalThis.fetch=originalFetch;config.runtimePort=originalPort;config.siteDomain=originalDomain;
    if(originalMode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=originalMode;
    if(originalHost===undefined)delete process.env.RUNTIME_INTERNAL_HOST;else process.env.RUNTIME_INTERNAL_HOST=originalHost;
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
