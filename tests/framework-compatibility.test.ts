import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { detectFramework } from '../packages/framework-adapters/src/index.js';
import { selectWebsiteLayout } from '../packages/storage/src/website-layout.js';

async function temporary(fn:(directory:string)=>Promise<void>){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'deployhub-framework-'));try{await fn(directory);}finally{await fs.rm(directory,{recursive:true,force:true});}}
async function files(root:string,content:Record<string,string>){for(const [relative,value] of Object.entries(content)){const filename=path.join(root,relative);await fs.mkdir(path.dirname(filename),{recursive:true});await fs.writeFile(filename,value);}}
const pkg=(value:unknown)=>JSON.stringify(value);

test('Next server projects retain production build scripts and have a real runtime start plan',async()=>temporary(async root=>{
  await files(root,{'package.json':pkg({dependencies:{next:'16', '@prisma/client':'6'},devDependencies:{prisma:'6'},scripts:{build:'prisma generate && next build --webpack',start:'next start --hostname 127.0.0.1'}}),'next.config.ts':"export default {output: process.env.BUILD_STANDALONE==='true'?'standalone':undefined}"});
  const plan=await detectFramework(root);assert.equal(plan.framework,'next');assert.equal(plan.deploymentKind,'runtime');assert.equal(plan.buildCommand,'npm run build');assert.match(plan.startCommand,/standalone\/server\.js/);assert.match(plan.startCommand,/--hostname 0\.0\.0\.0 --port 3000/);assert.match(plan.runtimePrepareCommand!,/\.next\/static/);assert.match(plan.runtimePrepareCommand!,/public/);assert.equal(plan.runtimePort,3000);
}));

test('Next static export remains static while server output is never mistaken for a static snapshot',async()=>temporary(async root=>{
  await files(root,{'package.json':pkg({dependencies:{next:'16'},scripts:{build:'next build',start:'next start'}}),'next.config.ts':"export default { output: 'export' }",'out/index.html':'<h1>Exported</h1>'});
  assert.equal((await detectFramework(root)).deploymentKind,'static');assert.ok((await selectWebsiteLayout(root)).staticDirectory);
  await fs.writeFile(path.join(root,'next.config.ts'),'export default {}');
  assert.equal((await detectFramework(root)).deploymentKind,'runtime');assert.equal((await selectWebsiteLayout(root)).staticDirectory,undefined);
}));

test('Next detection ignores commented examples, supports quoted keys and preserves a custom dist directory',async()=>temporary(async root=>{
  await files(root,{'package.json':pkg({dependencies:{next:'16'},scripts:{build:'next build'}}),'next.config.ts':`// output: 'export'\nconst example="output: 'export'"; export default {'distDir': '.build'}`});
  const plan=await detectFramework(root);assert.equal(plan.deploymentKind,'runtime');assert.equal(plan.outputDirectory,'.build');assert.match(plan.startCommand,/\.build\/standalone\/server\.js/);assert.match(plan.runtimePrepareCommand!,/\.build\/static/);
  await fs.writeFile(path.join(root,'next.config.ts'),"module.exports = {'output': 'export'}");assert.equal((await detectFramework(root)).framework,'next-static');
}));

test('SvelteKit is detected before its Vite dependency and adapter mode controls server rendering',async()=>temporary(async root=>{
  await files(root,{'package.json':pkg({devDependencies:{vite:'8','@sveltejs/kit':'2','@sveltejs/adapter-node':'5'},scripts:{build:'vite build'}}),'svelte.config.js':"import adapter from '@sveltejs/adapter-node'; export default {kit:{adapter:adapter()}}"});
  const server=await detectFramework(root);assert.equal(server.framework,'svelte');assert.equal(server.deploymentKind,'runtime');assert.equal(server.startCommand,'node build');
  await files(root,{'package.json':pkg({devDependencies:{vite:'8','@sveltejs/kit':'2','@sveltejs/adapter-static':'3'},scripts:{build:'vite build'}}),'svelte.config.js':"import adapter from '@sveltejs/adapter-static';export default {kit:{adapter:adapter()}}"});
  assert.equal((await detectFramework(root)).deploymentKind,'static');
  await files(root,{'package.json':pkg({devDependencies:{vite:'8','@sveltejs/kit':'2','@sveltejs/adapter-auto':'3'},scripts:{build:'vite build'}}),'svelte.config.js':"import adapter from '@sveltejs/adapter-auto';export default {kit:{adapter:adapter()}}"});
  assert.match((await detectFramework(root)).unsupportedReason!,/adapter-node/);
}));

test('Nuxt distinguishes generated static sites from a production server',async()=>temporary(async root=>{
  await files(root,{'package.json':pkg({dependencies:{nuxt:'4'},scripts:{build:'nuxt build'}})});
  const server=await detectFramework(root);assert.equal(server.deploymentKind,'runtime');assert.equal(server.startCommand,'node .output/server/index.mjs');
  await fs.writeFile(path.join(root,'package.json'),pkg({dependencies:{nuxt:'4'},scripts:{generate:'nuxt generate'}}));
  const generated=await detectFramework(root);assert.equal(generated.deploymentKind,'static');assert.equal(generated.outputDirectory,'.output/public');assert.equal(generated.buildCommand,'npm run generate');
}));

test('Astro SSR cannot publish only its prerendered client pages',async()=>temporary(async root=>{
  await files(root,{'package.json':pkg({dependencies:{astro:'6','@astrojs/node':'10'},scripts:{build:'astro build'}}),'astro.config.mjs':"import node from '@astrojs/node';export default {output:'server',adapter:node({mode:'standalone'})}",'dist/client/index.html':'<h1>Partial client</h1>','dist/server/entry.mjs':'server'});
  const plan=await detectFramework(root);assert.equal(plan.deploymentKind,'runtime');assert.equal(plan.startCommand,'node dist/server/entry.mjs');assert.equal((await selectWebsiteLayout(root)).staticDirectory,undefined);
}));

test('package-manager declarations take precedence and lockfile rules match each manager version',async()=>temporary(async root=>{
  await files(root,{'package.json':pkg({packageManager:'yarn@1.22.22',devDependencies:{vite:'8'},scripts:{build:'vite build'}}),'yarn.lock':'# yarn lockfile v1','pnpm-lock.yaml':'lockfileVersion: 9'});
  const classic=await detectFramework(root);assert.equal(classic.packageManager,'yarn');assert.equal(classic.packageManagerVersion,'1.22.22');assert.match(classic.installCommand,/--frozen-lockfile/);assert.equal(classic.buildCommand,'corepack yarn run build');
  await fs.writeFile(path.join(root,'package.json'),pkg({packageManager:'yarn@4.6.0',devDependencies:{vite:'8'},scripts:{build:'vite build'}}));assert.match((await detectFramework(root)).installCommand,/--immutable/);
  await fs.writeFile(path.join(root,'package.json'),pkg({packageManager:'pnpm@10.1.0',devDependencies:{vite:'8'},scripts:{build:'vite build'}}));assert.match((await detectFramework(root)).installCommand,/pnpm install --frozen-lockfile/);
}));

test('Prisma metadata discovers only schema requirements and safe local initialization commands',async()=>temporary(async root=>{
  await files(root,{'package.json':pkg({dependencies:{next:'16','@prisma/client':'6'},devDependencies:{prisma:'6'},scripts:{build:'prisma generate && next build'}}),'prisma/schema.prisma':'generator client { provider = "prisma-client-js" }\ndatasource db { provider = "sqlite"\n url = env("DATABASE_URL")\n }','prisma/migrations/initial/migration.sql':'CREATE TABLE example (id TEXT);'});
  const plan=await detectFramework(root);assert.deepEqual(plan.requiredEnvironmentVariables,['DATABASE_URL']);assert.equal(plan.database?.provider,'sqlite');assert.equal(plan.database?.hasMigrations,true);assert.match(plan.database!.generateCommand,/npm exec --no -- prisma generate --schema 'prisma\/schema.prisma'/);assert.match(plan.database!.migrationCommand!,/migrate deploy/);
  await fs.rm(path.join(root,'prisma/migrations'),{recursive:true});assert.match((await detectFramework(root)).database!.migrationCommand!,/db push --skip-generate/);
  await fs.writeFile(path.join(root,'package.json'),pkg({dependencies:{next:'16'},prisma:{schema:'../outside/schema.prisma'}}));await assert.rejects(detectFramework(root),/inside the uploaded project/);
}));

test('plain Node servers without a build or package manifest are detected and start with a fixed command',async()=>temporary(async root=>{
  await files(root,{'server.js':'require("node:http").createServer((req,res)=>res.end("hello")).listen(process.env.PORT);'});
  const plan=await detectFramework(root);assert.equal(plan.framework,'node');assert.equal(plan.deploymentKind,'runtime');assert.equal(plan.buildCommand,'');assert.equal(plan.installCommand,'');assert.equal(plan.startCommand,"node 'server.js'");assert.equal((await selectWebsiteLayout(root)).projectRoot,root);
}));
