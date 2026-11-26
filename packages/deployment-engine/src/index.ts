import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { db } from '../../database/src/index.js';
import { config, previewUrl, productionUrl } from '../../shared/src/config.js';
import { extractZip, inventory, safePath } from '../../storage/src/safe-files.js';
import { preparePublishedHtml, selectWebsiteLayout, validateStaticWebsite } from '../../storage/src/website-layout.js';
import { detectFramework, presets, type Framework } from '../../framework-adapters/src/index.js';
import { projectSecrets } from '../../shared/src/secrets.js';
import { getInstallationId, probeWorkerCapabilities } from '../../shared/src/capabilities.js';
import { buildAndStartRuntime, stopRuntime, type RuntimeMetadata } from '../../runtime-adapters/src/index.js';

export const terminalStates = new Set(['live','failed','cancelled','archived']);
const secretsByDeployment=new Map<string,string[]>();
export function redact(message: string) {
  return message.replace(/dh_[a-zA-Z0-9_-]+/g,'[REDACTED]').replace(/(authorization|password|token|secret|api[_-]?key)(\s*[=:]\s*)([^\s]+)/gi,'$1$2[REDACTED]').slice(0,16000);
}
export async function log(deploymentId: string, message: string, level = 'info') {
  for(const secret of secretsByDeployment.get(deploymentId) || [])if(secret)message=message.split(secret).join('[REDACTED]');
  await db.deploymentLog.create({ data: { deploymentId, message: redact(message), level } });
}
async function stage(id: string, status: string, message: string) {
  const deployment = await db.deployment.findUniqueOrThrow({ where: { id } });
  if (deployment.status === 'cancelled') throw new Error('Deployment cancelled');
  await db.deployment.update({ where: { id }, data: { status } });
  await log(id, message);
}
const q = (value: string) => "'" + value.replace(/'/g,"'\\''") + "'";
export function isolatedBuildArguments(name:string,source:string,output:string,command:string,envFile?:string) {
  return ['run','--rm','--name',name,'--user','1000:1000','--cap-drop=ALL','--security-opt=no-new-privileges','--read-only','--cpus','1','--memory','768m','--memory-swap','768m','--pids-limit','128','--network',process.env.BUILD_NETWORK || 'none','--tmpfs','/tmp:rw,nosuid,nodev,size=128m','--tmpfs',`/work:rw,nosuid,nodev,size=${config.maxExtractedBytes},mode=1777`,'--mount',`type=bind,src=${source},dst=/source,readonly`,'--mount',`type=bind,src=${output},dst=/output`,'-e','HOME=/tmp',...(envFile?['--env-file',envFile]:[]),config.buildImage,'sh','-ec',command];
}

async function buildInDocker(id: string, source: string, rootRelative: string, outputRelative: string, install: string, build: string, workspace: string,variables:Record<string,string>) {
  if (process.env.BUILD_DOCKER_ENABLED !== 'true') throw new Error('Framework builds require the isolated Docker worker. Deploy prebuilt static output or enable BUILD_DOCKER_ENABLED on the VPS.');
  const output = path.join(workspace,'docker-output');
  await fs.mkdir(output, { recursive: true, mode: 0o777 });
  await fs.chmod(output, 0o777);
  const hostDirectory = (directory: string) => process.env.BUILD_HOST_DATA_DIR ? path.posix.join(process.env.BUILD_HOST_DATA_DIR, path.relative(config.dataDirectory, directory).replace(/\\/g,'/')) : directory;
  const name = `deployhub-${id}`;
  const envFile=Object.keys(variables).length ? path.join(workspace,'build.env') : undefined;
  if(envFile)await fs.writeFile(envFile,Object.entries(variables).map(([name,value])=>`${name}=${value}`).join('\n'),{mode:0o600});
  const command = `cp -R /source/. /work/ && cd ${q('/work/' + rootRelative)} && ${install || 'true'} && ${build || 'true'} && test -d ${q(outputRelative)} && cp -R ${q(outputRelative + '/.')} /output/`;
  await log(id, `Using isolated ${config.buildImage} build; memory 768 MiB, 1 CPU, 128 processes, no capabilities; network ${process.env.BUILD_NETWORK || 'none'}.`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn('docker', isolatedBuildArguments(name,hostDirectory(source),hostDirectory(output),command,envFile), { stdio:['ignore','pipe','pipe'] });
    let finished = false, stopping = false;
    const stop = (reason: Error) => {
      if (stopping) return;
      stopping = true;
      const killer = spawn('docker',['rm','-f',name], { stdio:'ignore' });
      killer.on('error',()=>{});
      child.kill();
      finish(reason);
    };
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout); clearInterval(monitor);
      error ? reject(error) : resolve();
    };
    const timeout = setTimeout(()=>stop(new Error('Build timeout exceeded')), config.buildTimeoutMs);
    const monitor = setInterval(async()=>{
      try {
        const deployment = await db.deployment.findUnique({ where:{ id },select:{status:true} });
        if (deployment?.status === 'cancelled') return stop(new Error('Deployment cancelled'));
        await inventory(output);
      } catch(error) { stop(error as Error); }
    },1000);
    const capture=(stream:NodeJS.ReadableStream,level:string)=>{
      let pending='',oversized=false;const decoder=new StringDecoder('utf8');
      stream.on('data',(data:Buffer)=>{
        pending+=decoder.write(data);
        const lines=pending.split('\n');pending=lines.pop() || '';
        for(const line of lines){if(!oversized)void log(id,line.trim(),level).catch(()=>{});oversized=false;}
        if(pending.length>65536){pending='';oversized=true;void log(id,'[Oversized build log line omitted]',level).catch(()=>{});}
      });
      stream.on('end',()=>{pending+=decoder.end();if(pending&&!oversized)void log(id,pending.trim(),level).catch(()=>{});});
    };
    capture(child.stdout,'info');capture(child.stderr,'warning');
    child.on('error',finish);
    child.on('close', code=>finish(code === 0 ? undefined : new Error(`Isolated build failed with exit code ${code}`)));
  });
  return output;
}

export async function verifyArtifact(project: {slug: string}, deployment: {id:string}) {
  const origin = new URL(previewUrl(project,deployment));
  const redirectStatuses=new Set([301,302,303,307,308]);
  let target=new URL(origin);
  for(let redirects=0;redirects<=5;redirects++){
    const result=await new Promise<{status:number;bytes:number;identity?:string;location?:string}>((resolve,reject)=>{
      const request = http.get({ hostname:process.env.RUNTIME_INTERNAL_HOST || '127.0.0.1',port:config.runtimePort,path:target.pathname+target.search,headers:{Host:origin.host,'X-DeployHub-Health':'1'},signal:AbortSignal.timeout(10000) }, response=>{
        let bytes=0;response.on('data',(chunk:Buffer)=>{bytes+=chunk.length;});response.on('error',reject);
        response.on('end',()=>resolve({status:response.statusCode||0,bytes,identity:String(response.headers['x-deployhub-deployment']||''),location:response.headers.location}));
      });request.on('error',reject);
    });
    if(result.identity!==deployment.id)throw new Error(`Artifact health check failed: HTTP ${result.status} or deployment identity mismatch`);
    if(redirectStatuses.has(result.status)&&result.location){
      const next=new URL(result.location,target);if(next.origin!==origin.origin)throw new Error('Artifact health check redirected to a different website origin');
      if(redirects===5)throw new Error('Artifact health check exceeded the redirect limit');target=next;continue;
    }
    if(result.status!==200||!result.bytes)throw new Error(`Artifact health check failed: HTTP ${result.status} or empty response`);
    break;
  }
  if (process.env.NODE_ENV === 'production' && config.siteDomain !== 'localhost' && !config.siteDomain.endsWith('.localhost')) {
    target=new URL(origin);
    for(let redirects=0;redirects<=5;redirects++){
      const response=await fetch(target,{redirect:'manual',signal:AbortSignal.timeout(30000)});
      if(response.headers.get('x-deployhub-deployment')!==deployment.id){await response.body?.cancel();throw new Error(`Public preview verification failed: HTTP ${response.status} or deployment identity mismatch. Check DNS and reverse proxy routing.`);}
      const location=response.headers.get('location');
      if(redirectStatuses.has(response.status)&&location){
        await response.body?.cancel();const next=new URL(location,target);
        if(next.origin!==origin.origin)throw new Error('Public preview verification redirected to a different website origin');
        if(redirects===5)throw new Error('Public preview verification exceeded the redirect limit');target=next;continue;
      }
      if(response.status!==200){await response.body?.cancel();throw new Error(`Public preview verification failed: HTTP ${response.status}. Check wildcard DNS and reverse proxy HTTPS routing.`);}
      const reader=response.body?.getReader();const first=await reader?.read();await reader?.cancel();
      if(!first?.value?.length)throw new Error('Public preview verification returned an empty response');break;
    }
  }
}

export async function executeDeployment(id: string) {
  const claimed = await db.deployment.updateMany({ where:{ id,status:'queued' },data:{ status:'extracting' } });
  if (!claimed.count) return;
  const start = Date.now();
  const workspace = path.join(config.workspaces,id);
  let runtime:RuntimeMetadata|undefined;
  let activated=false;
  try {
    const deployment = await db.deployment.findUniqueOrThrow({ where:{id},include:{project:true} });
    await fs.rm(workspace,{recursive:true,force:true});
    const source = path.join(workspace,'source');
    await fs.mkdir(source,{recursive:true});
    await log(id,'Upload received; extracting into an isolated workspace.');
    const inputStat = await fs.stat(deployment.uploadPath);
    if (inputStat.isDirectory()) await fs.cp(deployment.uploadPath,source,{recursive:true,dereference:false});
    else await extractZip(deployment.uploadPath,source);
    await inventory(source);
    const project = { ...deployment.project, ...JSON.parse(deployment.configuration || '{}') } as typeof deployment.project;
    const variables=await projectSecrets(project.id,deployment.environment);
    secretsByDeployment.set(id,Object.values(variables).sort((a,b)=>b.length-a.length));
    await stage(id,'validating','Validating project paths and detecting framework.');
    const layout = await selectWebsiteLayout(source, project);
    const base = source, root = layout.projectRoot;
    for (const message of layout.notes) await log(id, message);
    const detected = await detectFramework(root);
    const framework = layout.staticDirectory ? 'static' : project.framework === 'auto' ? detected.framework : project.framework as Framework;
    const preset = presets[framework];
    if (!preset) throw new Error(`Unsupported framework: ${framework}`);
    await db.deployment.update({where:{id},data:{framework}});
    await log(id,`Detected ${framework}; package manager ${detected.packageManager}.`);
    const useDetectedPlan=project.framework==='auto'||framework===detected.framework;
    const requiresRuntime=!layout.staticDirectory&&(useDetectedPlan?detected.deploymentKind==='runtime':preset.dynamic);
    if(detected.unsupportedReason&&!layout.staticDirectory&&useDetectedPlan)throw new Error(detected.unsupportedReason);
    if(requiresRuntime){
      const ready=await probeWorkerCapabilities();
      if(!ready.dynamicRuntimeAvailable)throw new Error(ready.reason||'A Linux Docker worker is required to deploy this server application. Open the worker setup guide, then retry the retained upload as a preview.');
      runtime=await buildAndStartRuntime({id,projectId:project.id,environment:deployment.environment,
        appUrl:deployment.environment==='production'?productionUrl(project):previewUrl(project,deployment),
        sourceDirectory:source,projectRootRelative:path.relative(source,root).replace(/\\/g,'/'),framework,
        installCommand:project.installCommand||detected.installCommand,buildCommand:project.buildCommand||detected.buildCommand,startCommand:detected.startCommand,
        runtimePrepareCommand:detected.runtimePrepareCommand,variables,database:detected.database,installationId:await getInstallationId(),
        onLog:(message,level)=>log(id,message,level),onStage:(status,message)=>stage(id,status,message),
        isCancelled:async()=>{const state=await db.deployment.findUnique({where:{id},select:{status:true}});return !state||state.status==='cancelled';},
      });
      await db.deploymentArtifact.upsert({where:{deploymentId:id},create:{deploymentId:id,path:runtime.path,sizeBytes:BigInt(runtime.sizeBytes),sha256:runtime.sha256,kind:'runtime',runtimeImage:runtime.image,runtimeContainer:runtime.container,runtimeEndpoint:runtime.endpoint},update:{path:runtime.path,sizeBytes:BigInt(runtime.sizeBytes),sha256:runtime.sha256,kind:'runtime',runtimeImage:runtime.image,runtimeContainer:runtime.container,runtimeEndpoint:runtime.endpoint}});
    } else {
    let output = project.outputDirectory || (useDetectedPlan?detected.outputDirectory:preset.outputDirectory) || preset.outputDirectory;
    let artifactSource: string;
    if (layout.staticDirectory) {
      artifactSource = layout.staticDirectory;
      await log(id,layout.prebuilt ? 'Validated prebuilt website: dependency installation and build skipped.' : 'Static website: dependency installation and build skipped.');
    } else {
      if (framework === 'static' && !project.buildCommand && !project.installCommand) throw new Error('No browser-ready static output was found. Upload the complete dist/build/out folder or select automatic framework detection to build the source.');
      await stage(id,'installing_dependencies','Installing dependencies inside the isolated build container.');
      const install = project.installCommand || detected.installCommand;
      const build = project.buildCommand || detected.buildCommand || preset.buildCommand.replace('npm run',detected.packageManager === 'npm' ? 'npm run' : detected.packageManager === 'pnpm' ? 'corepack pnpm run' : 'corepack yarn');
      output ||= 'dist';
      safePath(root,output);
      await stage(id,'building',`Build command: ${build || '(none)'}`);
      artifactSource = await buildInDocker(id,base,path.relative(base,root).replace(/\\/g,'/'),output,install,build,workspace,variables);
      const built = await selectWebsiteLayout(artifactSource,{framework:'static'});
      if (!built.staticDirectory) throw new Error('The build did not produce a browser-ready static website');
      artifactSource = built.staticDirectory;
      await log(id,`Built publish directory detected: ${built.rootDirectory}`);
    }
    await inventory(artifactSource);
    const entryFile = await validateStaticWebsite(artifactSource,layout.staticDirectory ? layout.entryFile : undefined);
    await stage(id,'publishing','Creating immutable deployment artifact.');
    const artifactPath = path.join(config.artifacts,id);
    await fs.rm(artifactPath,{recursive:true,force:true});
    await fs.cp(artifactSource,artifactPath,{recursive:true,dereference:false});
    if (entryFile !== 'index.html') {
      const original = path.join(artifactPath,entryFile), canonical = path.join(artifactPath,'index.html');
      if (entryFile.toLowerCase() === 'index.html') {
        const temporary = path.join(artifactPath,'.deployhub-entry-'+crypto.randomBytes(6).toString('hex'));
        await fs.rename(original,temporary);await fs.rename(temporary,canonical);
      } else await fs.copyFile(original,canonical);
      const html = await fs.readFile(canonical,'utf8');
      const prepared = preparePublishedHtml(html,entryFile);
      if (prepared !== html) await fs.writeFile(canonical,prepared);
    }
    const content = await inventory(artifactPath);
    const hash = crypto.createHash('sha256');
    for (const name of content.files.sort()) { hash.update(name); hash.update(await fs.readFile(path.join(artifactPath,name))); }
    await db.deploymentArtifact.upsert({where:{deploymentId:id},create:{deploymentId:id,path:artifactPath,sizeBytes:BigInt(content.bytes),sha256:hash.digest('hex')},update:{path:artifactPath,sizeBytes:BigInt(content.bytes)}});
    }
    await stage(id,'verifying','Verifying the artifact through the independent website runtime.');
    await verifyArtifact(project,deployment);
    await db.$transaction(async transaction=>{
      const latest = await transaction.deployment.findUniqueOrThrow({where:{id}});
      const activeProject = await transaction.project.findUniqueOrThrow({where:{id:project.id}});
      if (latest.status === 'cancelled') throw new Error('Deployment cancelled');
      if (activeProject.status !== 'active') throw new Error('Project is disabled or archived');
      await transaction.deployment.update({where:{id},data:{status:'live',durationMs:Date.now()-start,error:null}});
      if (deployment.environment === 'production') await transaction.project.update({where:{id:project.id},data:{currentDeploymentId:id}});
    });
    activated=true;
    await log(id, deployment.environment === 'production' ? 'Health check passed. Production version switched atomically.' : 'Health check passed. Immutable preview is live; production was preserved.');
  } catch(error) {
    if(runtime&&!activated)await stopRuntime(id).catch(()=>{});
    const message = redact((error as Error).message);
    const current = await db.deployment.findUnique({where:{id}});
    if (current) {
      await db.deployment.update({where:{id},data:{status:current.status === 'cancelled' ? 'cancelled' : 'failed',error:message,durationMs:Date.now()-start}});
      await log(id,message,'error');
    }
  } finally { secretsByDeployment.delete(id);await fs.rm(workspace,{recursive:true,force:true}).catch(()=>{}); }
}

export async function activateDeployment(id: string) {
  const deployment = await db.deployment.findUniqueOrThrow({where:{id},include:{project:true,artifact:true}});
  if (deployment.status !== 'live' || !deployment.artifact) throw new Error('Only successful retained deployments can be activated');
  if(deployment.artifact.kind==='runtime'&&deployment.environment==='preview')throw new Error('A server preview uses preview storage and secrets. Create an explicitly authorized production retry before activating it.');
  if (deployment.project.status !== 'active') throw new Error('Project is disabled or archived');
  await verifyArtifact(deployment.project,deployment);
  await db.project.update({where:{id:deployment.projectId},data:{currentDeploymentId:id}});
  await log(id,'Existing verified artifact activated without rebuilding.');
  return deployment;
}
