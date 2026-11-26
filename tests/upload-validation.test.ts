import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Request, Response } from 'express';
import { createMultipartUpload, UploadError, validateUploadPaths } from '../apps/api/src/uploads.js';

test('folder manifests preserve deeply nested and Unicode paths',()=>{
  const paths=['Client Export/Website/Release/public/index.html','Client Export/Website/Release/public/assets/logo.svg','Client Export/Website/Release/public/हिन्दी.html'];
  assert.deepEqual(validateUploadPaths('/upload',JSON.stringify(paths),paths.length),paths);
  assert.throws(()=>validateUploadPaths('/upload','invalid',1),error=>error instanceof UploadError && error.status===400);
});

test('conflicting file/folder paths, duplicates and unsafe Windows names are rejected before disk operations',()=>{
  for(const paths of [['page','page/index.html'],['page/index.html','page'],['index.html','INDEX.html'],['../index.html'],['index.html/../app.js'],['file:stream'],['NUL.txt'],['folder./index.html']]) {
    assert.throws(()=>validateUploadPaths('/upload',JSON.stringify(paths),paths.length),error=>error instanceof UploadError && error.status===400);
  }
});

async function serverFixture(run:(base:string,directory:string)=>Promise<void>,limits={maxBytes:16*1024*1024,maxFiles:100}) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'deployhub-upload-test-'));
  await fs.writeFile(path.join(directory,'retained-artifact.zip'),'keep existing data');
  const upload=createMultipartUpload({directory,...limits});
  const server=http.createServer((request,response)=>upload(request as Request,response as Response,error=>{
    response.setHeader('Content-Type','application/json');
    if(error){response.statusCode=error.status || 500;response.end(JSON.stringify({error:error.message}));return;}
    const parsed=request as Request;
    const files=Object.values(parsed.files || {}).flat() as Express.Multer.File[];
    response.statusCode=202;
    response.end(JSON.stringify({files:files.map(file=>({size:file.size,name:file.originalname})),paths:parsed.body.paths}));
  }));
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`,directory);}
  finally {await new Promise<void>(resolve=>server.close(()=>resolve()));await fs.rm(directory,{recursive:true,force:true});}
}

async function assertClean(directory:string) {
  for(let attempt=0;attempt<50;attempt++) {
    const names=await fs.readdir(directory);
    if(names.every(name=>!name.startsWith('.incoming-'))) break;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.deepEqual(await fs.readdir(directory),['retained-artifact.zip']);
}

test('actual HTTP folder multipart accepts a payload larger than 10 MiB',async()=>{
  await serverFixture(async(base,directory)=>{
    const body=new FormData();body.append('files',new Blob([Buffer.alloc(12*1024*1024,65)]),'large.js');body.append('files',new Blob(['<h1>nested website</h1>']),'index.html');
    body.append('paths',JSON.stringify(['one/two/three/public/assets/large.js','one/two/three/public/index.html']));
    const response=await fetch(base,{method:'POST',body});assert.equal(response.status,202);
    const result=await response.json() as any;
    assert.equal(result.files[0].size,12*1024*1024);assert.equal(JSON.parse(result.paths)[1],'one/two/three/public/index.html');
    await assertClean(directory);
  });
});

test('aggregate file budget returns JSON 413 and removes only request-owned temporary files',async()=>{
  await serverFixture(async(base,directory)=>{
    const body=new FormData();body.append('files',new Blob([Buffer.alloc(600)]),'a.js');body.append('files',new Blob([Buffer.alloc(600)]),'b.js');body.append('paths','["a.js","b.js"]');
    const response=await fetch(base,{method:'POST',body});assert.equal(response.status,413);assert.match((await response.json() as any).error,/folder exceeds/i);
    await assertClean(directory);
  },{maxBytes:1024,maxFiles:10});
});

test('incomplete multipart returns JSON 400 and cleans partial files',async()=>{
  await serverFixture(async(base,directory)=>{
    const response=await fetch(base,{method:'POST',headers:{'Content-Type':'multipart/form-data; boundary=example'},body:'--example\r\nContent-Disposition: form-data; name="files"; filename="index.html"\r\nContent-Type: text/html\r\n\r\n<h1>truncated'});
    assert.equal(response.status,400);assert.match((await response.json() as any).error,/incomplete|interrupted/i);await assertClean(directory);
  });
});

test('too many files and unexpected fields return explicit JSON errors and clean staging',async()=>{
  await serverFixture(async(base,directory)=>{
    const body=new FormData();for(let i=0;i<3;i++)body.append('files',new Blob(['data']),`${i}.js`);
    const response=await fetch(base,{method:'POST',body});assert.equal(response.status,413);await assertClean(directory);
    const invalid=new FormData();invalid.append('unsupported',new Blob(['data']),'index.html');
    const unexpected=await fetch(base,{method:'POST',body:invalid});assert.equal(unexpected.status,400);await assertClean(directory);
  },{maxBytes:1024,maxFiles:2});
});
