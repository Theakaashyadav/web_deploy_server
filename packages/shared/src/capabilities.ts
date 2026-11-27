import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { db } from '../../database/src/index.js';
import { config } from './config.js';

export type WorkerCapabilities = {
  checkedAt: string;
  dockerInstalled: boolean;
  dockerAvailable: boolean;
  sourceBuildsAvailable: boolean;
  dynamicRuntimeAvailable: boolean;
  dependencyNetworkEnabled: boolean;
  reason?: string;
  supportedRuntimeFrameworks: string[];
};

export async function resolveDockerExecutable() {
  if(process.env.DOCKER_BIN)return process.env.DOCKER_BIN;
  if(process.platform==='win32') {
    const candidates=[`${process.env.ProgramFiles || 'C:/Program Files'}/Docker/Docker/resources/bin/docker.exe`,`${process.env.LOCALAPPDATA || ''}/Programs/DockerDesktop/resources/bin/docker.exe`];
    for(const candidate of candidates)if(await fs.access(candidate).then(()=>true,()=>false)){process.env.DOCKER_BIN=candidate;return candidate;}
  }
  return 'docker';
}

export async function probeWorkerCapabilities(): Promise<WorkerCapabilities> {
  const checkedAt=new Date().toISOString();
  const enabled=process.env.BUILD_DOCKER_ENABLED==='true';
  const executable=await resolveDockerExecutable();
  const probe=await new Promise<{installed:boolean;available:boolean;linux:boolean}>(resolve=>{
    const child=spawn(executable,['info','--format','{{.OSType}}'],{stdio:['ignore','pipe','ignore'],windowsHide:true});
    let output='',finished=false;
    const finish=(result:{installed:boolean;available:boolean;linux:boolean})=>{if(finished)return;finished=true;clearTimeout(timeout);resolve(result);};
    const timeout=setTimeout(()=>{child.kill();finish({installed:true,available:false,linux:false});},5000);
    child.stdout.on('data',chunk=>{if(output.length<4096)output+=chunk.toString();});
    child.on('error',(error:NodeJS.ErrnoException)=>finish({installed:error.code!=='ENOENT',available:false,linux:false}));
    child.on('close',code=>finish({installed:true,available:code===0,linux:output.trim().toLowerCase()==='linux'}));
  });
  const available=probe.available&&probe.linux;
  let reason:string|undefined;
  if(!probe.installed)reason='Docker is not installed on the deployment worker. Install and start a Linux-container Docker backend, or configure a Linux worker.';
  else if(!probe.available)reason='The Docker daemon is unavailable. Start Docker Desktop or the Linux Docker service, then retry.';
  else if(!probe.linux)reason='Docker must use Linux containers for Node.js and framework deployments.';
  else if(!enabled)reason='The isolated build worker is disabled. Enable BUILD_DOCKER_ENABLED after configuring Docker.';
  const runtimeEnabled=process.env.RUNTIME_DOCKER_ENABLED!=='false';
  const networkEnabled=!!process.env.BUILD_NETWORK&&process.env.BUILD_NETWORK!=='none';
  const dependencyReady=networkEnabled||process.env.BUILD_OFFLINE_READY==='true';
  if(!reason&&!dependencyReady)reason='Dependency downloads are disabled. Configure an approved build network, or a prepared offline build image, before deploying source projects.';
  return {checkedAt,dockerInstalled:probe.installed,dockerAvailable:available,sourceBuildsAvailable:enabled&&available&&dependencyReady,dynamicRuntimeAvailable:enabled&&available&&dependencyReady&&runtimeEnabled,
    dependencyNetworkEnabled:networkEnabled,reason:reason || (!runtimeEnabled ? 'Dynamic runtimes are disabled by the worker configuration.' : undefined),
    supportedRuntimeFrameworks:['next','node','nuxt','astro','svelte','angular']};
}

export async function publishWorkerCapabilities() {
  const capabilities=config.deploymentMode==='legacy' ? await probeWorkerCapabilities() : {checkedAt:new Date().toISOString(),dockerInstalled:false,dockerAvailable:false,sourceBuildsAvailable:false,dynamicRuntimeAvailable:false,dependencyNetworkEnabled:false,supportedRuntimeFrameworks:[],reason:'GitHub static mode fetches ready website files without local builds or containers.'};
  await db.applicationSetting.upsert({where:{key:'worker:capabilities'},create:{key:'worker:capabilities',value:JSON.stringify(capabilities)},update:{value:JSON.stringify(capabilities)}});
  return capabilities;
}

export async function getInstallationId() {
  const record=await db.applicationSetting.upsert({where:{key:'runtime:installation-id'},create:{key:'runtime:installation-id',value:randomBytes(16).toString('hex')},update:{}});
  if(!/^[a-f0-9]{32}$/.test(record.value))throw new Error('Invalid runtime installation identifier');
  return record.value;
}
