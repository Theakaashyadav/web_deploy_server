import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {StringDecoder} from 'node:string_decoder';
import {config} from '../../shared/src/config.js';
import {hostPath,projectRelative,runtimeNames,runtimeContainerArguments,runtimeStartupCommand,runtimeBuildCommand,trustedRuntimeDockerfile,type RuntimeBuildOptions,type RuntimeMetadata} from './plan.js';

const dockerBinary=()=>process.env.DOCKER_BIN||'docker';
async function docker(args:string[],options:{timeout?:number;log?:(message:string,level?:string)=>Promise<unknown>|unknown;cancel?:()=>Promise<boolean>;monitor?:()=>Promise<void>}={}) {
  return new Promise<string>((resolve,reject)=>{
    const child=spawn(dockerBinary(),args,{stdio:['ignore','pipe','pipe']});
    let output='',errorOutput='',finished=false,loggedBytes=0,loggedLines=0,omitted=false;const pending:Promise<unknown>[]=[];
    const emit=(message:string,level:string)=>{
      if(!options.log)return;
      loggedBytes+=Buffer.byteLength(message)+1;loggedLines++;
      if(loggedBytes>8388608||loggedLines>10000){if(!omitted){omitted=true;pending.push(Promise.resolve(options.log('[Further runtime log output omitted after the configured log budget]',level)).catch(()=>{}));}return;}
      pending.push(Promise.resolve(options.log(message,level)).catch(()=>{}));
    };
    const finish=(error?:Error)=>{if(finished)return;finished=true;clearTimeout(timer);clearInterval(monitor);void Promise.allSettled(pending).then(()=>error?reject(error):resolve(output.trim()));};
    const timer=setTimeout(()=>{child.kill();finish(new Error('The isolated runtime operation timed out'));},options.timeout||config.buildTimeoutMs);
    let checking=false;
    const monitor=setInterval(()=>{
      if(checking||finished)return;checking=true;
      void(async()=>{if(await options.cancel?.())throw new Error('Deployment cancelled');await options.monitor?.();})().catch(error=>{child.kill();finish(error as Error);}).finally(()=>{checking=false;});
    },1000);
    const streams={info:{decoder:new StringDecoder('utf8'),line:'',dropping:false},warning:{decoder:new StringDecoder('utf8'),line:'',dropping:false}};
    const capture=(level:'info'|'warning',data:Buffer)=>{
      const text=streams[level].decoder.write(data);if(level==='warning')errorOutput=(errorOutput+text).slice(-16000);else output=(output+text).slice(-2097152);
      if(options.log){
        const state=streams[level];state.line+=text;const lines=state.line.split('\n');state.line=lines.pop()||'';
        for(const line of lines){if(!state.dropping)emit(line.trim(),level);state.dropping=false;}
        if(state.line.length>65536){state.line='';state.dropping=true;emit('[Oversized runtime log line omitted]',level);}
      }
    };
    child.stdout.on('data',(data:Buffer)=>capture('info',data));child.stderr.on('data',(data:Buffer)=>capture('warning',data));
    child.on('error',error=>finish(new Error(`Docker runtime is unavailable: ${error.message}. Install/start a Linux Docker engine; uploaded source was not run on this computer.`)));
    child.on('close',code=>{
      if(options.log)for(const level of ['info','warning'] as const){const state=streams[level];state.line+=state.decoder.end();if(state.line&&!state.dropping)emit(state.line.trim(),level);}
      finish(code===0?undefined:new Error(`Docker runtime operation failed (${code}): ${errorOutput.trim().slice(-4000)||'inspect the deployment logs'}`));
    });
  });
}
export async function runtimeDockerAvailable() {
  try {const os=await docker(['info','--format','{{.OSType}}'],{timeout:10000});return {available:os==='linux',reason:os==='linux'?undefined:'Switch Docker to Linux containers.'};}
  catch(error){return {available:false,reason:(error as Error).message};}
}
function runtimeNetwork() {const name=process.env.RUNTIME_DOCKER_NETWORK||'deployhub-runtime';if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,80}$/.test(name))throw new Error('Invalid runtime network name');return name;}
async function ensureNetwork(name:string){
  if(await docker(['network','inspect',name],{timeout:10000}).then(()=>true,()=>false))return;
  await docker(['network','create','--driver','bridge',...(process.env.RUNTIME_NETWORK_INTERNAL==='false'?[]:['--internal']),name],{timeout:30000});
}
async function ensureImage(image:string,archive:string){
  if(await docker(['image','inspect',image],{timeout:10000}).then(()=>true,()=>false))return;
  await docker(['image','load','--input',archive],{timeout:config.buildTimeoutMs});
}
async function removeOwnedContainer(name:string,id:string,installationId?:string){
  const record=await docker(['inspect',name],{timeout:10000}).then(text=>JSON.parse(text)[0],()=>undefined);
  const labels=record?.Config?.Labels;
  if(labels?.['io.deployhub.managed']!=='1'||labels['io.deployhub.deployment']!==id||(installationId&&labels['io.deployhub.installation']!==installationId))return;
  await docker(['rm','--force',name],{timeout:20000}).catch(()=>{});
}
async function ensureDataVolume(name:string,options:{projectId:string;environment:string;installationId?:string;id:string}){
  const existing=await docker(['volume','inspect',name],{timeout:10000}).then(text=>JSON.parse(text)[0],()=>undefined);
  if(existing){
    const labels=existing.Labels;
    if(labels?.['io.deployhub.managed']!=='1'||labels['io.deployhub.project']!==options.projectId||(options.installationId&&labels['io.deployhub.installation']!==options.installationId))throw new Error('The application data volume belongs to another installation. Refusing to attach it.');
    return;
  }
  await docker(['volume','create','--label','io.deployhub.managed=1','--label',`io.deployhub.project=${options.projectId}`,'--label',`io.deployhub.environment=${options.environment}`,...(options.environment==='production'?[]:['--label',`io.deployhub.deployment=${options.id}`]),...(options.installationId?['--label',`io.deployhub.installation=${options.installationId}`]:[]),name],{timeout:20000});
}
function runtimeEnvironment(options:RuntimeBuildOptions,sqlite:boolean,build=false) {
  const variables={...options.variables};
  for(const name of ['APP_URL','NEXT_PUBLIC_SITE_URL','SITE_URL','ORIGIN'])variables[name] ||= options.appUrl;
  if(sqlite)variables[options.database?.environmentVariable||'DATABASE_URL']=build?'file:/tmp/deployhub-build.db':'file:/app-data/site.db';
  return {...variables,NODE_ENV:build?'development':'production',PORT:'3000',HOSTNAME:'0.0.0.0',HOST:'0.0.0.0',NEXT_TELEMETRY_DISABLED:'1',HOME:'/tmp',DEPLOYHUB_DATA_DIR:build?'/tmp/deployhub-app-data':'/app-data',COREPACK_HOME:'/app/.corepack',COREPACK_ENABLE_DOWNLOAD_PROMPT:'0',...(build?{}:{COREPACK_ENABLE_NETWORK:'0'})};
}
async function writeEnvironment(filename:string,variables:Record<string,string>){
  const text=Object.entries(variables).map(([name,value])=>{
    if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)||/[\r\n\0]/.test(value))throw new Error('Invalid runtime environment variable');
    return `${name}=${value}`;
  }).join('\n');
  await fs.writeFile(filename,text,{mode:0o600});
}
async function hashFile(filename:string){const hash=createHash('sha256');for await(const chunk of createReadStream(filename))hash.update(chunk);return hash.digest('hex');}
async function enforceBuildBudget(directory:string){
  const configured=Number(process.env.MAX_RUNTIME_BUILD_BYTES||4294967296),limit=Number.isSafeInteger(configured)&&configured>0?configured:4294967296;
  let bytes=0,count=0;
  const walk=async(folder:string):Promise<void>=>{
    for(const entry of await fs.readdir(folder,{withFileTypes:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error;})){
      if(++count>250000)throw new Error('The runtime build exceeds the 250,000-entry storage limit');
      const full=path.join(folder,entry.name),stat=await fs.lstat(full).catch(error=>{if(error.code==='ENOENT')return undefined;throw error;});
      if(!stat)continue;
      if(stat.isSymbolicLink()){
        const target=await fs.readlink(full);
        const resolved=path.resolve(path.dirname(full),target),relative=path.relative(directory,resolved);
        if(path.isAbsolute(target)||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('The runtime build created a symbolic link outside its application directory');
      }else if(stat.isDirectory())await walk(full);else if(stat.isFile())bytes+=stat.size;
      else throw new Error('The runtime build created a forbidden special file');
      if(bytes>limit)throw new Error('The runtime build exceeds its configured disk budget');
    }
  };
  await walk(directory);
}
async function endpointFor(container:string,gateway:'host'|'network') {
  if(gateway==='network')return `http://${container}:3000`;
  const inspect=JSON.parse(await docker(['inspect',container],{timeout:10000}));
  const bindings=inspect[0]?.NetworkSettings?.Ports?.['3000/tcp'];
  const port=bindings?.find((binding:{HostIp:string;HostPort:string})=>binding.HostIp==='127.0.0.1')?.HostPort;
  if(!/^\d+$/.test(port||''))throw new Error('Docker did not allocate a private runtime port');
  return `http://127.0.0.1:${port}`;
}
async function waitForRuntime(container:string,endpoint:string,log:RuntimeBuildOptions['onLog'],cancel?:RuntimeBuildOptions['isCancelled']) {
  const deadline=Date.now()+Math.min(config.buildTimeoutMs,120000);
  while(Date.now()<deadline){
    if(await cancel?.())throw new Error('Deployment cancelled');
    const inspect=JSON.parse(await docker(['inspect',container],{timeout:10000}));
    const state=inspect[0]?.State;
    if(!state?.Running){const logs=await docker(['logs','--tail','100',container],{timeout:10000}).catch(()=>'');if(logs)await log(logs,'error');throw new Error(`Application runtime exited before becoming healthy (exit ${state?.ExitCode}). Inspect start command, environment variables and database configuration.`);}
    // The Docker health command executes inside the restricted application container.
    if(state.Health?.Status==='healthy')return;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  const logs=await docker(['logs','--tail','100',container],{timeout:10000}).catch(()=>'');if(logs)await log(logs,'error');
  throw new Error(`Application runtime did not become healthy at ${endpoint}. The app must listen on 0.0.0.0:3000 and respond to GET /.`);
}

/** Only trusted orchestration invokes Docker; all uploaded install/build/start commands execute inside containers. */
export async function buildAndStartRuntime(options:RuntimeBuildOptions):Promise<RuntimeMetadata> {
  if(process.env.BUILD_DOCKER_ENABLED!=='true')throw new Error('This website needs a Node/Next.js runtime. Start a Linux Docker engine and enable the isolated worker; uploaded source cannot execute directly on the host.');
  const available=await runtimeDockerAvailable();if(!available.available)throw new Error(available.reason||'Docker Linux containers are unavailable');
  const names=runtimeNames(options.id,options.projectId,options.environment), relative=projectRelative(options.projectRootRelative);
  const baseImage=process.env.RUNTIME_BUILD_IMAGE||'node:22-bookworm';
  trustedRuntimeDockerfile(baseImage,relative,options.startCommand);
  const work=path.join(config.workspaces,options.id,'runtime'), app=path.join(work,'app'), artifact=path.join(config.artifacts,options.id);
  const sqlite=options.database?.provider==='sqlite'&&!options.variables[options.database.environmentVariable||'DATABASE_URL'];
  const gateway=process.env.RUNTIME_DOCKER_GATEWAY==='network'?'network':'host';
  const network=runtimeNetwork();
  const buildEnv=path.join(work,'build.env'),runEnv=path.join(work,'runtime.env');
  const redact=(message:string)=>{for(const value of Object.values(options.variables).sort((a,b)=>b.length-a.length))if(value)message=message.split(value).join('[REDACTED]');return message;};
  const logger=(message:string,level?:string)=>options.onLog(redact(message),level);
  await fs.mkdir(app,{recursive:true});await fs.chmod(app,0o777);await fs.mkdir(artifact,{recursive:true});
  try{
    await writeEnvironment(buildEnv,runtimeEnvironment(options,sqlite,true));
    await options.onStage?.('installing_dependencies','Installing dependencies in the isolated runtime build container.');
    const command=runtimeBuildCommand(options,sqlite);
    const configuredMemory=Number(process.env.BUILD_MEMORY_MB||2048),memory=Number.isSafeInteger(configuredMemory)&&configuredMemory>=256&&configuredMemory<=16384?configuredMemory:2048;
    const builderArgs=['run','--rm','--name',names.builder,'--user','1000:1000','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--cpus','1','--memory',`${memory}m`,'--memory-swap',`${memory}m`,'--pids-limit','256','--network',process.env.BUILD_NETWORK||'none','--tmpfs','/tmp:rw,nosuid,nodev,size=256m,mode=1777','--mount',`type=bind,src=${hostPath(options.sourceDirectory,config.dataDirectory)},dst=/source,readonly`,'--mount',`type=bind,src=${hostPath(app,config.dataDirectory)},dst=/app`,'--env-file',buildEnv,'--label','io.deployhub.managed=1','--label',`io.deployhub.deployment=${options.id}`,...(options.installationId?['--label',`io.deployhub.installation=${options.installationId}`]:[]),baseImage,'sh','-ec',command];
    await options.onStage?.('building',`Building the ${options.framework} server application in an isolated container.`);
    await docker(builderArgs,{log:logger,cancel:options.isCancelled,monitor:()=>enforceBuildBudget(app)});
    await enforceBuildBudget(app);
    await options.onStage?.('publishing','Creating an immutable runtime image and private application container.');
    await fs.mkdir(path.join(work,'data'),{recursive:true});await fs.writeFile(path.join(work,'data','.deployhub-volume'),'Private application database volume.\n');
    await fs.writeFile(path.join(work,'Dockerfile'),trustedRuntimeDockerfile(baseImage,relative,runtimeStartupCommand(options,sqlite)));
    await fs.writeFile(path.join(work,'.dockerignore'),'build.env\nruntime.env\nDockerfile\n');
    await docker(['build','--network','none','--file',path.join(work,'Dockerfile'),'--tag',names.image,'--label','io.deployhub.managed=1','--label',`io.deployhub.deployment=${options.id}`,...(options.installationId?['--label',`io.deployhub.installation=${options.installationId}`]:[]),work],{log:logger,cancel:options.isCancelled});
    const archive=path.join(artifact,'image.tar');
    const configuredLimit=Number(process.env.MAX_RUNTIME_ARTIFACT_BYTES||process.env.MAX_RUNTIME_IMAGE_BYTES||4294967296),limit=Number.isSafeInteger(configuredLimit)&&configuredLimit>0?configuredLimit:4294967296;
    await docker(['image','save','--output',archive,names.image],{cancel:options.isCancelled,monitor:async()=>{const size=await fs.stat(archive).then(stat=>stat.size,()=>0);if(size>limit)throw new Error('The runtime image exceeds the configured archive storage limit');}});
    const stat=await fs.stat(archive);
    if(stat.size>limit)throw new Error('The runtime image exceeds the configured archive storage limit');
    const sha256=await hashFile(archive);
    await writeEnvironment(runEnv,runtimeEnvironment(options,sqlite));
    await ensureNetwork(network);
    await ensureDataVolume(names.volume,options);
    await docker(runtimeContainerArguments({...options,image:names.image,network,envFile:runEnv,rootRelative:relative,sqlite,gateway}),{timeout:30000});
    const endpoint=await endpointFor(names.container,gateway);
    await waitForRuntime(names.container,endpoint,logger,options.isCancelled);
    const metadata={image:names.image,container:names.container,endpoint,path:artifact,sizeBytes:stat.size,sha256};
    await fs.writeFile(path.join(artifact,'runtime.json'),JSON.stringify({...metadata,framework:options.framework,projectId:options.projectId,environment:options.environment,appUrl:options.appUrl,rootRelative:relative,sqlite,sqliteVariable:options.database?.environmentVariable||'DATABASE_URL',volume:names.volume,network,gateway,installationId:options.installationId||null},null,2));
    await logger('The isolated application container is healthy. Gateway verification will run before activation.');
    return metadata;
  }catch(error){
    await removeOwnedContainer(names.builder,options.id,options.installationId);await removeOwnedContainer(names.container,options.id,options.installationId);
    await docker(['image','rm',names.image],{timeout:20000}).catch(()=>{});await fs.rm(artifact,{recursive:true,force:true}).catch(()=>{});
    throw new Error(redact((error as Error).message));
  }
  finally{await fs.rm(buildEnv,{force:true}).catch(()=>{});await fs.rm(runEnv,{force:true}).catch(()=>{});}
}

export async function stopRuntime(id:string,options:{removeImage?:boolean}={}) {
  const names=runtimeNames(id,'cleanup','preview');
  await removeOwnedContainer(names.container,id);await removeOwnedContainer(names.builder,id);
  if(options.removeImage)await docker(['image','rm',names.image],{timeout:20000}).catch(()=>{});
}

/** Reconcile persisted containers after host restarts; never executes on the gateway process. */
export async function ensureRuntime(metadata:{runtimeImage?:string|null;runtimeContainer?:string|null;runtimeEndpoint?:string|null;path:string},variables:Record<string,string>={}) {
  if(!metadata.runtimeImage||!metadata.runtimeContainer)throw new Error('Runtime artifact metadata is incomplete');
  const manifest=JSON.parse(await fs.readFile(path.join(metadata.path,'runtime.json'),'utf8'));
  const names=runtimeNames(manifest.container.replace(/^deployhub-runtime-/,''),manifest.projectId,manifest.environment);
  if(names.image!==metadata.runtimeImage||names.container!==metadata.runtimeContainer)throw new Error('Runtime artifact identity mismatch');
  await ensureImage(names.image,path.join(metadata.path,'image.tar'));
  const existing=await docker(['inspect',names.container],{timeout:10000}).then(text=>JSON.parse(text)[0],()=>undefined);
  if(existing){
    const labels=existing.Config?.Labels;
    if(labels?.['io.deployhub.managed']!=='1'||labels['io.deployhub.deployment']!==names.container.replace(/^deployhub-runtime-/,''))throw new Error('The runtime container belongs to another application.');
    if(!existing.State?.Running)await docker(['start',names.container],{timeout:20000});
    return endpointFor(names.container,manifest.gateway);
  }
  const envFile=path.join(config.workspaces,`${names.container}.env`);await fs.mkdir(config.workspaces,{recursive:true});
  try{
    const restoredVariables={...variables};for(const name of ['APP_URL','NEXT_PUBLIC_SITE_URL','SITE_URL','ORIGIN'])restoredVariables[name] ||= manifest.appUrl||'';
    await writeEnvironment(envFile,{...restoredVariables,...(manifest.sqlite?{[manifest.sqliteVariable||'DATABASE_URL']:'file:/app-data/site.db'}:{}),NODE_ENV:'production',PORT:'3000',HOSTNAME:'0.0.0.0',HOST:'0.0.0.0',HOME:'/tmp',DEPLOYHUB_DATA_DIR:'/app-data',NEXT_TELEMETRY_DISABLED:'1',COREPACK_HOME:'/app/.corepack',COREPACK_ENABLE_DOWNLOAD_PROMPT:'0',COREPACK_ENABLE_NETWORK:'0'});
    await ensureNetwork(manifest.network);
    await ensureDataVolume(names.volume,{projectId:manifest.projectId,environment:manifest.environment,id:manifest.container.replace(/^deployhub-runtime-/,''),installationId:manifest.installationId});
    await docker(runtimeContainerArguments({id:manifest.container.replace(/^deployhub-runtime-/,''),projectId:manifest.projectId,environment:manifest.environment,image:names.image,network:manifest.network,envFile,rootRelative:manifest.rootRelative,sqlite:manifest.sqlite,gateway:manifest.gateway,installationId:manifest.installationId}),{timeout:30000});
    const endpoint=await endpointFor(names.container,manifest.gateway);await waitForRuntime(names.container,endpoint,()=>{});return endpoint;
  }finally{await fs.rm(envFile,{force:true}).catch(()=>{});}
}
