import { db } from '../../../packages/database/src/index.js';
import { executeDeployment, log } from '../../../packages/deployment-engine/src/index.js';
import { config } from '../../../packages/shared/src/config.js';
import { Queue, Worker } from 'bullmq';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { publishWorkerCapabilities } from '../../../packages/shared/src/capabilities.js';
import { reconcileRuntimes } from '../../../packages/deployment-engine/src/runtime-recovery.js';

let stopped = false;
const sleep = (ms:number)=>new Promise(r=>setTimeout(r,ms));
async function recover() {
  const stale = await db.deployment.findMany({where:{status:{in:['extracting','validating','installing_dependencies','building','publishing','verifying']},updatedAt:{lt:new Date(Date.now()-config.buildTimeoutMs-120000)}}});
  for (const deployment of stale) {
    if (process.env.BUILD_DOCKER_ENABLED === 'true') await new Promise<void>(resolve=>{const cleanup=spawn('docker',['rm','-f',`deployhub-${deployment.id}`],{stdio:'ignore'});cleanup.on('close',()=>resolve());cleanup.on('error',()=>resolve());});
    await db.deployment.updateMany({where:{id:deployment.id,status:deployment.status},data:{status:'queued'}});
    await log(deployment.id,'Recovering an interrupted deployment after its lease expired.','warning');
  }
}
async function main() {
  await db.$connect();
  let publishing=false,reconciling=false,lastReconciliation=0;
  const report=async()=>{
    if(publishing)return;publishing=true;
    try {
      const capabilities=await publishWorkerCapabilities();
      if(capabilities.dockerAvailable&&!reconciling&&Date.now()-lastReconciliation>30000){
        reconciling=true;lastReconciliation=Date.now();
        void reconcileRuntimes().catch(error=>console.error('Runtime reconciliation:',error.message)).finally(()=>{reconciling=false;});
      }
    } finally {publishing=false;}
  };
  await report();
  const heartbeat=setInterval(()=>{void report().catch(error=>console.error('Worker readiness:',error.message));},15000);
  console.log('DeployHub worker ready; persistent deployment recovery enabled.');
  let queue: Queue | undefined, worker: Worker | undefined;
  if (process.env.REDIS_URL) {
    const require = createRequire(import.meta.url);
    const Redis = require('ioredis');
    const connection = new Redis(process.env.REDIS_URL,{maxRetriesPerRequest:null});
    queue = new Queue('deployhub-builds',{connection});
    worker = new Worker('deployhub-builds',async job=>executeDeployment(job.data.id),{connection,concurrency:Math.max(1,Math.min(8,Number(process.env.BUILD_CONCURRENCY || 1)))});
    worker.on('error',error=>console.error('Queue worker:',error.message));
  }
  const quit = async()=>{ stopped=true; clearInterval(heartbeat); await worker?.close(); await queue?.close(); await db.$disconnect(); process.exit(0); };
  process.on('SIGTERM',()=>{void quit();}); process.on('SIGINT',()=>{void quit();});
  while (!stopped) {
    try {
      await recover();
      const pending = await db.deployment.findMany({where:{status:'queued'},orderBy:{createdAt:'asc'},take:20});
      for (const deployment of pending) {
        if (queue) await queue.add('deploy',{id:deployment.id},{jobId:deployment.id,removeOnComplete:true,removeOnFail:true,attempts:3,backoff:{type:'exponential',delay:3000}});
        else await executeDeployment(deployment.id);
      }
    } catch(error) { console.error('Worker iteration:',(error as Error).message); }
    await sleep(1000);
  }
}
main().catch(error=>{ console.error(error); process.exitCode=1; });
