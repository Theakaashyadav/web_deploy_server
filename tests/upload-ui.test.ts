import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareUploadFiles, readDroppedFiles, uploadResponseError, uploadSelectionProblem } from '../apps/dashboard/lib/upload.js';

test('browser folder selection preserves nested roots and assets while excluding local credentials and dependencies',()=>{
  const file=(path:string)=>({file:new File(['content'],path.split('/').at(-1)!),path});
  const result=prepareUploadFiles([file('outer/another/site/public/index.html'),file('outer/another/site/public/assets/main.css'),file('outer/another/site/src/main.ts'),file('outer/node_modules/dependency/index.js'),file('outer/.git/config'),file('outer/.env.production')]);
  assert.equal(result.skipped,3);
  assert.deepEqual(result.files.map(entry=>entry.path),['outer/another/site/public/index.html','outer/another/site/public/assets/main.css','outer/another/site/src/main.ts']);
  assert.throws(()=>prepareUploadFiles([file('../private/index.html')]),/unsafe/);
  assert.throws(()=>prepareUploadFiles([file('site/Index.html'),file('site/index.html')]),/same path/);
  for(const directory of ['.npm-cache','.pnpm-store','.parcel-cache','.local','.tmp','backups'])assert.equal(prepareUploadFiles([file(`site/${directory}/private.bin`)]).skipped,1);
});

test('browser errors explain proxy failures and show structured validation details without dumping HTML',()=>{
  assert.match(uploadResponseError(500,'<html>Internal Server Error</html>'),/upload service.*HTTP 500/i);
  assert.ok(!uploadResponseError(500,'<html>secret-server-page</html>').includes('secret-server-page'));
  assert.match(uploadResponseError(413,''),/size or file-count limit/);
  assert.match(uploadResponseError(401,''),/Sign in again/);
  assert.equal(uploadResponseError(400,JSON.stringify({error:'Validation failed',details:[{path:'rootDirectory',message:'Unsafe path'}]})),'Validation failed. rootDirectory: Unsafe path');
});

test('browser validates selection metadata against actual server limits without inventing limits',()=>{
  const file={file:new File(['123456'],'index.html'),path:'folder/index.html'};
  assert.equal(uploadSelectionProblem([file],null),'');
  assert.equal(uploadSelectionProblem([file],{maxUploadBytes:6,maxFiles:1}),'');
  assert.match(uploadSelectionProblem([file],{maxUploadBytes:5,maxFiles:1}),/exceeds the server/);
  assert.match(uploadSelectionProblem([file,file],{maxUploadBytes:100,maxFiles:1}),/server allows 1/);
});

test('dropped folders read every browser directory page and preserve relative nested paths',async()=>{
  const file=(name:string)=>({name,isFile:true,isDirectory:false,file:(done:(file:File)=>void)=>done(new File(['content'],name))});
  let calls=0,secretReads=0;
  const entries=Array.from({length:101},(_,i)=>file(i===0?'index.html':`asset-${i}.js`));
  const root={name:'website',isDirectory:true,isFile:false,createReader:()=>({readEntries:(done:(entries:unknown[])=>void)=>{
    calls++;done(calls===1?entries.slice(0,100):calls===2?[...entries.slice(100),{name:'node_modules',isFile:false,isDirectory:true,createReader:()=>{secretReads++;throw new Error('Should not read dependencies');}}]:[]);
  }})};
  const result=await readDroppedFiles([{kind:'file',webkitGetAsEntry:()=>root}] as unknown as DataTransferItemList,[] as unknown as FileList);
  assert.equal(calls,3);assert.equal(secretReads,0);assert.equal(result.files.length,101);assert.equal(result.skipped,1);
  assert.equal(result.files[0].path,'website/index.html');assert.equal(result.files[100].path,'website/asset-100.js');
});
