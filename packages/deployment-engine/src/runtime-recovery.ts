import { spawn } from 'node:child_process';
import { db } from '../../database/src/index.js';
import { getInstallationId, resolveDockerExecutable } from '../../shared/src/capabilities.js';
import { projectSecrets } from '../../shared/src/secrets.js';
import { ensureRuntime, stopRuntime } from '../../runtime-adapters/src/index.js';

export function managedRuntimeDeployments(output:string) {
  return [...new Set(output.split(/\r?\n/).map(line=>line.trim().split('|')).filter(([name,id])=>/^deployhub-(?:runtime|build)-dpl-[a-z0-9-]{6,40}$/.test(name||'')&&/^dpl-[a-z0-9-]{6,40}$/.test(id||'')&&name.endsWith(id)).map(([,id])=>id))];
}

async function ownedContainers(installationId:string) {
  const executable=await resolveDockerExecutable();
  const output=await new Promise<string>((resolve,reject)=>{
    const child=spawn(executable,['ps','--all','--filter','label=io.deployhub.managed=1','--filter',`label=io.deployhub.installation=${installationId}`,'--format','{{.Names}}|{{.Label "io.deployhub.deployment"}}'],{stdio:['ignore','pipe','ignore'],windowsHide:true});
    let output='';const timer=setTimeout(()=>{child.kill();reject(new Error('Docker runtime reconciliation timed out'));},10000);
    child.stdout.on('data',chunk=>{if(output.length<1048576)output+=chunk.toString();});
    child.on('error',error=>{clearTimeout(timer);reject(error);});child.on('close',code=>{clearTimeout(timer);code===0?resolve(output):reject(new Error('Cannot inspect managed runtime containers'));});
  });
  return managedRuntimeDeployments(output);
}

/** Runs only in the trusted worker; the gateway and API never receive Docker access. */
export async function reconcileRuntimes() {
  const installationId=await getInstallationId();
  const owned=await ownedContainers(installationId);
  for(const id of owned){
    const deployment=await db.deployment.findUnique({where:{id},include:{project:true}});
    if(!deployment||['failed','cancelled','archived'].includes(deployment.status)||deployment.project.status!=='active'){
      await stopRuntime(id,{removeImage:!deployment});
    }
  }
  const artifacts=await db.deploymentArtifact.findMany({where:{kind:'runtime',deployment:{status:'live',project:{status:'active'}}},include:{deployment:{include:{project:true}}}});
  for(const artifact of artifacts){
    try {
      const variables=await projectSecrets(artifact.deployment.projectId,artifact.deployment.environment);
      const endpoint=await ensureRuntime(artifact,variables);
      if(endpoint!==artifact.runtimeEndpoint)await db.deploymentArtifact.update({where:{id:artifact.id},data:{runtimeEndpoint:endpoint}});
    } catch(error) {
      // A health failure never changes production to an unrelated deployment or marks a failed site live.
      console.error(`Runtime recovery ${artifact.deploymentId}:`,(error as Error).message);
    }
  }
}
