import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { ZipArchive } from 'archiver';
import http from 'node:http';

test('real deployment platform: authentication, isolation, versions, CLI, recovery', { timeout: 180000 }, async t => {
  const tag = randomBytes(4).toString('hex');
  const directory = path.resolve('data', `integration-${tag}`);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'database.db'), '', { flag: 'wx', mode: 0o600 });
  const apiPort = 4300 + Math.floor(Math.random() * 300);
  const runtimePort = apiPort + 1000;
  const dashboardPort = apiPort + 2000;
  const dashboardDirectory = path.join(directory,'dashboard');
  const url = `http://127.0.0.1:${apiPort}`;
  const databaseUrl = `file:../../../data/integration-${tag}/database.db`;
  const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl, DATA_DIR: directory,
    API_PORT: String(apiPort), RUNTIME_PORT: String(runtimePort), SITE_DOMAIN: 'localhost',
    SITE_PROTOCOL: 'http', SITE_PORT: String(runtimePort), BUILD_DOCKER_ENABLED: 'false',
    REDIS_URL: '', SETUP_TOKEN: '', ENCRYPTION_KEY: 'ab'.repeat(32), DASHBOARD_ORIGIN: `http://127.0.0.1:${dashboardPort}`,
    PRISMA_SCHEMA_ENGINE_BINARY: path.resolve(`node_modules/@prisma/engines/schema-engine-${process.platform === 'win32' ? 'windows.exe' : 'debian-openssl-3.0.x'}`),
  };
  let output = '';
  const processes: ChildProcess[] = [];
  const processTrees = new WeakSet<ChildProcess>();
  function start(file: string) {
    const child = spawn(process.execPath, ['--import', 'tsx', file], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout!.on('data', d => { output += d; }); child.stderr!.on('data', d => { output += d; });
    processes.push(child); return child;
  }
  async function startDashboard() {
    await fs.mkdir(dashboardDirectory,{recursive:true});
    for(const name of ['app','lib','next.config.ts','postcss.config.mjs','package.json','tsconfig.json','next-env.d.ts']){
      const source=path.resolve('apps/dashboard',name);
      if(await fs.access(source).then(()=>true,()=>false))await fs.cp(source,path.join(dashboardDirectory,name),{recursive:true});
    }
    const child=spawn(process.execPath,[path.resolve('node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port',String(dashboardPort)],{
      cwd:dashboardDirectory,
      env:{...env,API_ORIGIN:url,DEPLOYHUB_NEXT_DIST_DIR:'.next',NEXT_TELEMETRY_DISABLED:'1'},
      stdio:['ignore','pipe','pipe'],
    });
    child.stdout!.on('data',d=>{output+=d;});child.stderr!.on('data',d=>{output+=d;});processes.push(child);processTrees.add(child);return child;
  }
  async function command(args: string[], extraEnv: Record<string, string> = {}) {
    return new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, args, { env: { ...env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '', err = ''; child.stdout.on('data', d => out += d); child.stderr.on('data', d => err += d);
      child.on('error', reject); child.on('close', code => code === 0 ? resolve(out) : reject(new Error(`${args.join(' ')} failed (${code}): ${err}\n${out}`)));
    });
  }
  async function stop(child: ChildProcess) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    if(process.platform==='win32' && processTrees.has(child) && child.pid){
      await new Promise<void>(resolve=>{const killer=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'});killer.on('error',()=>resolve());killer.on('close',()=>resolve());});return;
    }
    await new Promise<void>(resolve => { const timer=setTimeout(resolve,3000); child.once('exit', () => {clearTimeout(timer);resolve();}); child.kill(); });
  }
  async function ready(endpoint: string) {
    for (let i = 0; i < 120; i++) {
      if (await fetch(endpoint).then(r => r.ok, () => false)) return;
      await new Promise(r => setTimeout(r, 150));
    }
    throw new Error(`Service never became ready: ${endpoint}\n${output}`);
  }
  t.after(async () => { await Promise.all(processes.map(stop)); await fs.rm(directory, { recursive: true, force: true,maxRetries:5,retryDelay:200 }); });
  await command(['node_modules/prisma/build/index.js', 'db', 'push', '--skip-generate', '--schema', 'packages/database/prisma/schema.local.prisma']);
  let api = start('apps/api/src/index.ts');
  let runtime = start('apps/worker/src/runtime.ts');
  let worker = start('apps/worker/src/index.ts');
  await Promise.all([ready(url + '/healthz'), ready(`http://127.0.0.1:${runtimePort}/healthz`)]);
  let token = '';
  async function request(endpoint: string, body?: unknown, method?: string, useToken = token) {
    const response = await fetch(url + '/api/v1' + endpoint, { method: method || (body ? 'POST' : 'GET'),
      headers: { ...(useToken ? { Authorization: `Bearer ${useToken}` } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? body instanceof FormData ? body : JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() as any, response };
  }
  let projectA: any, projectB: any, first: any, second: any;
  async function zip(content?: string, source?: Record<string, unknown>) {
    const file = path.join(directory, `upload-${randomBytes(4).toString('hex')}.zip`);
    const stream = createWriteStream(file); const archive = new ZipArchive(); archive.pipe(stream);
    if (content) archive.append(content, { name: 'index.html' });
    if (source) archive.append(JSON.stringify(source), { name: 'package.json' });
    if (!content && !source) archive.append('No HTML', { name: 'readme.txt' });
    await archive.finalize(); await new Promise<void>((r, reject) => { stream.on('close', r); stream.on('error', reject); });
    return new Blob([await fs.readFile(file)], { type: 'application/zip' });
  }
  async function deploy(project: any, content?: string, source?: Record<string, unknown>, production = true) {
    const form = new FormData(); form.append('archive', await zip(content, source), 'website.zip');
    form.append('environment', production ? 'production' : 'preview'); if (production) form.append('authorizeProduction', 'true');
    const result = await request(`/projects/${project.id}/deployments`, form); assert.equal(result.status, 202, JSON.stringify(result.data));
    for (let i = 0; i < 80; i++) {
      const state = await request(`/deployments/${result.data.id}`);
      if (['live', 'failed', 'cancelled'].includes(state.data.status)) return state.data;
      await new Promise(r => setTimeout(r, 200));
    }
    throw new Error('Deployment timeout\n' + output);
  }
  async function waitForDeployment(id:string) {
    for(let i=0;i<100;i++){
      const state=(await request(`/deployments/${id}`)).data;
      if(['live','failed','cancelled'].includes(state.status))return state;
      await new Promise(r=>setTimeout(r,200));
    }
    throw new Error('Deployment timeout\n'+output);
  }
  async function site(hostname: string, pathname = '/') {
    return new Promise<{status:number;text:()=>Promise<string>}>((resolve,reject)=>{
      const request=http.get({hostname:'127.0.0.1',port:runtimePort,path:pathname,headers:{Host:`${hostname}.localhost:${runtimePort}`}},response=>{
        let body='';response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve({status:response.statusCode!,text:async()=>body}));
      });request.on('error',reject);
    });
  }
  await t.test('first administrator, invalid login, secure sessions and API key auth', async () => {
    assert.equal((await request('/projects')).status, 401);
    const setup = await request('/auth/setup', { name: 'Integration Admin', email: 'admin@example.test', password: 'A-test-password-!2026' });
    assert.equal(setup.status, 201); token = setup.data.token; assert.ok(token);
    assert.match(setup.response.headers.get('set-cookie') || '', /HttpOnly/i);
    assert.equal((await request('/auth/login', { email: 'admin@example.test', password: 'incorrect' })).status, 401);
    assert.equal((await request('/auth/me')).data.user.email, 'admin@example.test');
    const key = await request('/api-keys', { name: 'Integration CLI', scopes: ['read', 'deploy', 'manage'] });
    assert.equal(key.status, 201); token = key.data.token;
    assert.ok(!JSON.stringify((await request('/api-keys')).data).includes(token));
  });
  await t.test('duplicate names get unique URLs; two websites deploy independently', async () => {
    projectA = (await request('/projects', { name: 'Integration Site' })).data;
    projectB = (await request('/projects', { name: 'Integration Site' })).data;
    assert.notEqual(projectA.slug, projectB.slug);
    [first, second] = await Promise.all([deploy(projectA, '<h1>Site A version one</h1>'), deploy(projectB, '<h1>Site B independent</h1>')]);
    assert.equal(first.status, 'live', JSON.stringify(first)); assert.equal(second.status, 'live', JSON.stringify(second));
    assert.match(await (await site(projectA.slug)).text(), /Site A version one/);
    assert.match(await (await site(projectB.slug)).text(), /Site B independent/);
    assert.notEqual(first.productionUrl, second.productionUrl);
  });
  await t.test('preview, production update, atomic pointer and rollback', async () => {
    const preview = await deploy(projectA, '<h1>Preview only</h1>', undefined, false);
    assert.equal(preview.status, 'live');
    assert.match(await (await site(`${projectA.slug}--${preview.id}`)).text(), /Preview only/);
    assert.match(await (await site(projectA.slug)).text(), /version one/);
    const version2 = await deploy(projectA, '<h1>Site A version two</h1>');
    assert.equal(version2.productionUrl, first.productionUrl);
    assert.match(await (await site(projectA.slug)).text(), /version two/);
    assert.equal((await request(`/deployments/${first.id}/rollback`, {})).status, 400);
    assert.equal((await request(`/deployments/${first.id}/rollback`, { authorizeProduction: true })).status, 200);
    assert.match(await (await site(projectA.slug)).text(), /version one/);
  });
  await t.test('failed static output and unavailable builds preserve live production', async () => {
    const failure = await deploy(projectA); assert.equal(failure.status, 'failed');
    const framework = await deploy(projectA, undefined, { scripts: { build: 'vite build' }, dependencies: { vite: '8.3.8' } });
    assert.equal(framework.status, 'failed'); assert.match(framework.error, /Docker|build|index.html/i);
    assert.match(await (await site(projectA.slug)).text(), /version one/);
    assert.match(await (await site(projectB.slug)).text(), /independent/);
    const logs = (await request(`/deployments/${failure.id}/logs`)).data.logs;
    assert.ok(logs.some((entry: any) => entry.level === 'error'));
  });
  await t.test('scoped API keys enforce project and deploy permissions; domains require ownership', async () => {
    const key = (await request('/api-keys', { name: 'Site A reader', scopes: ['read'], projectId: projectA.id })).data;
    assert.equal((await request(`/projects/${projectA.id}`, undefined, undefined, key.token)).status, 200);
    assert.equal((await request(`/projects/${projectB.id}`, undefined, undefined, key.token)).status, 404);
    assert.equal((await request(`/projects/${projectA.id}/deployments`, new FormData(), undefined, key.token)).status, 403);
    const domain = (await request(`/projects/${projectA.id}/domains`, { hostname: 'unowned.example.test' })).data;
    assert.ok(domain.verificationToken); assert.equal((await request(`/domains/${domain.id}/verify`, {})).status, 409);
    assert.equal((await fetch(`http://127.0.0.1:${runtimePort}/internal/tls/ask?domain=unowned.example.test`)).status, 403);
    await request(`/api-keys/${key.key.id}`, {}, 'DELETE');
    assert.equal((await request('/projects', undefined, undefined, key.token)).status, 401);
    const variable=await request(`/projects/${projectA.id}/environment`,{name:'API_SECRET',value:'sensitive-fixture',environment:'preview'},'PUT');
    assert.equal(variable.status,200);
    const variables=JSON.stringify((await request(`/projects/${projectA.id}/environment`)).data);
    assert.match(variables,/API_SECRET/);assert.ok(!variables.includes('sensitive-fixture'));assert.ok(!variables.includes('ciphertext'));
  });
  await t.test('folder upload and actual CLI return content served by the runtime', async () => {
    const folder = new FormData(); folder.append('files', new Blob(['<h1>Folder upload</h1>']), 'index.html'); folder.append('paths', JSON.stringify(['index.html']));
    const upload = await request(`/projects/${projectA.id}/deployments`, folder); assert.equal(upload.status, 202);
    let folderDeployment=upload.data;
    for(let i=0;i<50 && !['live','failed'].includes(folderDeployment.status);i++){await new Promise(r=>setTimeout(r,200));folderDeployment=(await request(`/deployments/${upload.data.id}`)).data;}
    assert.equal(folderDeployment.status,'live');assert.match(await (await site(`${projectA.slug}--${folderDeployment.id}`)).text(),/Folder upload/);
    const fixture = path.join(directory, 'cli-site'); await fs.mkdir(fixture); await fs.writeFile(path.join(fixture, 'index.html'), '<h1>CLI website</h1>');
    await fs.writeFile(path.join(fixture, '.env'), 'SECRET=never-upload');
    const json = await command(['apps/cli/dist/index.js', 'deploy', '--dir', fixture, '--project', projectB.slug, '--prod', '--json'], { DEPLOYHUB_URL: url, DEPLOYHUB_TOKEN: token });
    const deployment = JSON.parse(json); assert.equal(deployment.status, 'live');
    assert.match(await (await site(projectB.slug)).text(), /CLI website/);
    assert.equal((await site(projectB.slug,'/.env')).status,404);
  });
  await t.test('deeply nested folder larger than 10 MiB uploads through the dashboard and preserves assets',async()=>{
    const dashboard=await startDashboard();const dashboardUrl=`http://127.0.0.1:${dashboardPort}`;
    await ready(dashboardUrl+'/api/v1/auth/setup');
    try {
      const prefix='Uploaded folder/level two/level three/site/public/';
      const form=new FormData();
      const paths=['Uploaded folder/README.txt',prefix+'index.html',prefix+'assets/site.css',prefix+'assets/app.js',prefix+'assets/image.bin'];
      const contents=['A wrapped website with documentation.','<!doctype html><html><head><link rel="stylesheet" href="assets/site.css"></head><body><h1>Nested folder works</h1><script src="assets/app.js"></script></body></html>','body{color:blue}','window.nestedUploadWorks=true;',Buffer.alloc(12*1024*1024,7)];
      form.set('paths',JSON.stringify(paths));form.set('environment','preview');
      contents.forEach((content,i)=>form.append('files',new Blob([content]),path.posix.basename(paths[i])));
      const upload=await fetch(dashboardUrl+`/api/v1/projects/${projectA.id}/deployments`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:form});
      const body=await upload.text();assert.equal(upload.status,202,body+'\n'+output);
      const deployment=await waitForDeployment(JSON.parse(body).id);assert.equal(deployment.status,'live',JSON.stringify(deployment));
      const hostname=`${projectA.slug}--${deployment.id}`;
      assert.match(await (await site(hostname)).text(),/Nested folder works/);
      assert.match(await (await site(hostname,'/assets/site.css')).text(),/color:blue/);
      assert.match(await (await site(hostname,'/assets/app.js')).text(),/nestedUploadWorks/);
      assert.equal((await site(hostname,'/assets/image.bin')).status,200);
      assert.match(await (await site(projectA.slug)).text(),/version one/);
      if(process.env.DEPLOYHUB_BROWSER_TEST==='1') {
        const folder=path.join(directory,'Browser folder');
        const nested=path.join(folder,'first','second','website','public');
        await fs.mkdir(path.join(nested,'assets'),{recursive:true});
        await fs.writeFile(path.join(folder,'README.txt'),'Nested folder browser upload fixture');
        await fs.writeFile(path.join(folder,'.env'),'FIXTURE_ONLY=must-not-upload');
        await fs.mkdir(path.join(folder,'node_modules','ignored'),{recursive:true});
        await fs.writeFile(path.join(folder,'node_modules','ignored','fixture.js'),'must not upload');
        await fs.writeFile(path.join(nested,'index.html'),'<html><head><link rel="stylesheet" href="assets/site.css"></head><body><h1>Nested browser upload</h1><script src="assets/app.js"></script></body></html>');
        await fs.writeFile(path.join(nested,'assets','site.css'),'h1{color:rgb(18,52,86)}');
        await fs.writeFile(path.join(nested,'assets','app.js'),'window.browserNestedWorks=true;');
        await fs.writeFile(path.join(nested,'assets','large.bin'),Buffer.alloc(12*1024*1024,9));
        const {verifyFolderUpload}=await import('../e2e/upload-browser.mjs');
        const browserDeployment=await verifyFolderUpload({dashboardUrl,folder,projectId:projectA.id,productionUrl:projectA.productionUrl,email:'admin@example.test',password:'A-test-password-!2026'});
        assert.equal((await request(`/deployments/${browserDeployment}`)).data.status,'live');
      }
    } finally {await stop(dashboard);}
  });
  await t.test('nested ZIP ready output is detected and ambiguous or source-only folders fail safely',async()=>{
    async function uploadFiles(files:Record<string,string>,overrides:Record<string,string>={}){
      const form=new FormData();const paths=Object.keys(files);form.set('paths',JSON.stringify(paths));form.set('environment','preview');
      for(const [name,content] of Object.entries(files))form.append('files',new Blob([content]),path.posix.basename(name));
      for(const [name,value] of Object.entries(overrides))form.set(name,value);
      const response=await request(`/projects/${projectA.id}/deployments`,form);assert.equal(response.status,202,JSON.stringify(response.data));return waitForDeployment(response.data.id);
    }
    const archive=new ZipArchive();const archivePath=path.join(directory,'nested-built.zip');const stream=createWriteStream(archivePath);archive.pipe(stream);
    archive.append(JSON.stringify({scripts:{build:'vite build'},devDependencies:{vite:'8.3.8'}}),{name:'outer/inner/application/package.json'});
    archive.append('<!doctype html><h1>Prebuilt nested website</h1><script src="./assets/app.js"></script>',{name:'outer/inner/application/dist/index.html'});
    archive.append('window.prebuilt=true;',{name:'outer/inner/application/dist/assets/app.js'});
    const done=new Promise<void>((resolve,reject)=>{stream.on('close',resolve);stream.on('error',reject);});await archive.finalize();await done;
    const zipForm=new FormData();zipForm.append('archive',new Blob([await fs.readFile(archivePath)]),'nested.zip');
    const upload=await request(`/projects/${projectA.id}/deployments`,zipForm);assert.equal(upload.status,202);
    const built=await waitForDeployment(upload.data.id);assert.equal(built.status,'live',JSON.stringify(built));
    assert.match(await (await site(`${projectA.slug}--${built.id}`)).text(),/Prebuilt nested website/);
    const ambiguous=await uploadFiles({'wrapper/first/index.html':'<h1>First</h1>','wrapper/second/index.html':'<h1>Second</h1>'});assert.equal(ambiguous.status,'failed');assert.match(ambiguous.error,/multiple|ambiguous|rootDirectory/i);
    const selected=await uploadFiles({'wrapper/first/index.html':'<h1>First</h1>','wrapper/second/index.html':'<h1>Second</h1>'},{rootDirectory:'wrapper/second'});assert.equal(selected.status,'live',JSON.stringify(selected));
    assert.match(await (await site(`${projectA.slug}--${selected.id}`)).text(),/Second/);
    const source=await uploadFiles({'wrapper/nested/package.json':JSON.stringify({scripts:{build:'vite build'},devDependencies:{vite:'8.3.8'}}),'wrapper/nested/index.html':'<div id="root"></div><script type="module" src="/src/main.tsx"></script>','wrapper/nested/src/main.tsx':'export default <h1>Needs a build</h1>'});
    assert.equal(source.status,'failed');assert.match(source.error,/Docker|build/i);
    assert.match(await (await site(projectA.slug)).text(),/version one/);
  });
  await t.test('bad folder metadata and file-directory collisions return JSON errors without creating deployments',async()=>{
    const before=(await request('/deployments')).data.deployments.length;
    for(const paths of ['{not-json}',JSON.stringify(['same','same/index.html']),JSON.stringify(['../outside.html'])]){
      const form=new FormData();form.set('paths',paths);
      const fileCount=paths.includes('same')?2:1;
      for(let i=0;i<fileCount;i++)form.append('files',new Blob(['<h1>Invalid upload</h1>']),`file-${i}.html`);
      const result=await request(`/projects/${projectA.id}/deployments`,form);assert.equal(result.status,400,JSON.stringify(result.data));assert.equal(typeof result.data.error,'string');
    }
    assert.equal((await request('/deployments')).data.deployments.length,before);
  });
  await t.test('worker readiness is truthful and retained source can retry as a preview without switching production',async()=>{
    assert.equal((await request('/capabilities',undefined,undefined,'')).status,401);
    const capabilities=await request('/capabilities');assert.equal(capabilities.status,200);assert.equal(capabilities.data.staticUploadsAvailable,true);assert.equal(capabilities.data.sourceBuildsAvailable,false);assert.equal(capabilities.data.dynamicRuntimeAvailable,false);
    assert.equal((await request(`/deployments/${first.id}/retry`,{environment:'production'})).status,400);
    const retry=await request(`/deployments/${first.id}/retry`,{});assert.equal(retry.status,202,JSON.stringify(retry.data));assert.notEqual(retry.data.id,first.id);assert.equal(retry.data.environment,'preview');
    const deployed=await waitForDeployment(retry.data.id);assert.equal(deployed.status,'live',JSON.stringify(deployed));
    assert.match(await (await site(`${projectA.slug}--${deployed.id}`)).text(),/version one/);assert.equal((await request(`/projects/${projectA.id}`)).data.currentDeploymentId,first.id);
    const reader=(await request('/api-keys',{name:'Retry reader',scopes:['read'],projectId:projectA.id})).data;
    assert.equal((await request(`/deployments/${first.id}/retry`,{},undefined,reader.token)).status,403);
    await request(`/api-keys/${reader.key.id}`,{},'DELETE');
  });
  await t.test('runtime gateway serves redirects and dynamic POST while preview storage cannot be activated as production',async()=>{
    const {PrismaClient}=await import('@prisma/client');const metadata=new PrismaClient({datasourceUrl:databaseUrl});
    const id='dpl-'+randomBytes(6).toString('hex');const artifactPath=path.join(directory,'runtime-fixture');await fs.mkdir(artifactPath);
    let counter=0;
    const application=http.createServer((incoming,response)=>{
      if(incoming.url==='/'){response.writeHead(307,{Location:'/en'});return response.end();}
      if(incoming.method==='POST'){counter++;return response.end(JSON.stringify({counter}));}
      response.end('<h1>Trusted dynamic proxy fixture</h1>');
    });
    await new Promise<void>(resolve=>application.listen(0,'127.0.0.1',resolve));
    try {
      const latest=await metadata.deployment.findFirst({where:{projectId:projectA.id},orderBy:{version:'desc'}});
      await metadata.deployment.create({data:{id,projectId:projectA.id,status:'live',environment:'preview',framework:'node',version:latest!.version+1,uploadPath:artifactPath,
        artifact:{create:{path:artifactPath,sizeBytes:0n,sha256:'0'.repeat(64),kind:'runtime',runtimeImage:`deployhub/${id}:immutable`,runtimeContainer:`deployhub-runtime-${id}`,runtimeEndpoint:`http://127.0.0.1:${(application.address() as import('node:net').AddressInfo).port}`}}}});
      const host=`${projectA.slug}--${id}`;
      assert.equal((await site(host)).status,307);assert.match(await (await site(host,'/en')).text(),/dynamic proxy fixture/);
      const result=await new Promise<{status:number;identity?:string;body:string}>((resolve,reject)=>{
        const incoming=http.request({hostname:'127.0.0.1',port:runtimePort,path:'/api/increment',method:'POST',headers:{Host:`${host}.localhost:${runtimePort}`}},response=>{
          let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve({status:response.statusCode!,identity:String(response.headers['x-deployhub-deployment']),body}));
        });incoming.on('error',reject);incoming.end('increment');
      });
      assert.equal(result.status,200);assert.equal(result.identity,id);assert.equal(JSON.parse(result.body).counter,1);
      assert.equal((await request(`/deployments/${id}/artifact`)).status,409);
      assert.equal((await request(`/deployments/${id}/promote`,{authorizeProduction:true})).status,409);
      assert.equal((await request(`/projects/${projectA.id}`)).data.currentDeploymentId,first.id);
    } finally {await metadata.deployment.deleteMany({where:{id}});await metadata.$disconnect();await new Promise<void>(resolve=>application.close(()=>resolve()));}
  });
  await t.test('website runtime survives API/worker restart; persistent projects remain', async () => {
    await stop(worker);
    const form=new FormData();form.append('archive',await zip('<h1>Recovered queued preview</h1>'),'queued.zip');
    const queued=await request(`/projects/${projectB.id}/deployments`,form);assert.equal(queued.status,202);assert.equal(queued.data.status,'queued');
    await stop(api);
    assert.match(await (await site(projectA.slug)).text(), /version one/);
    api = start('apps/api/src/index.ts'); worker = start('apps/worker/src/index.ts'); await ready(url + '/healthz');
    assert.equal((await request('/projects')).data.projects.length, 2);
    assert.match(await (await site(projectB.slug)).text(), /CLI website/);
    let recovered=queued.data;
    for(let i=0;i<50 && !['live','failed'].includes(recovered.status);i++){await new Promise(r=>setTimeout(r,200));recovered=(await request(`/deployments/${queued.data.id}`)).data;}
    assert.equal(recovered.status,'live');assert.match(await (await site(`${projectB.slug}--${recovered.id}`)).text(),/Recovered queued preview/);
  });
  await t.test('SQLite metadata snapshot restores active version after a complete restart', async () => {
    await stop(api); await stop(worker); await stop(runtime);
    const snapshot = path.join(directory, 'snapshot.db'); await fs.copyFile(path.join(directory, 'database.db'), snapshot);
    api = start('apps/api/src/index.ts'); worker = start('apps/worker/src/index.ts'); runtime = start('apps/worker/src/runtime.ts');
    await Promise.all([ready(url + '/healthz'), ready(`http://127.0.0.1:${runtimePort}/healthz`)]);
    const update = await deploy(projectA, '<h1>Temporary later version</h1>'); assert.equal(update.status, 'live');
    await stop(api); await stop(worker); await stop(runtime);
    await fs.copyFile(snapshot, path.join(directory, 'database.db'));
    api = start('apps/api/src/index.ts'); worker = start('apps/worker/src/index.ts'); runtime = start('apps/worker/src/runtime.ts');
    await Promise.all([ready(url + '/healthz'), ready(`http://127.0.0.1:${runtimePort}/healthz`)]);
    assert.match(await (await site(projectA.slug)).text(), /version one/);
  });
  await t.test('authorized operator password recovery revokes sessions and API keys',async()=>{
    const output=await command(['--import','tsx','infrastructure/scripts/reset-password.ts','admin@example.test','--confirm-reset']);
    const password=output.match(/shown once\): ([^\r\n]+)/)?.[1];assert.ok(password);
    assert.equal((await request('/projects')).status,401);
    const login=await request('/auth/login',{email:'admin@example.test',password});assert.equal(login.status,200);assert.ok(login.data.token);
  });
});
