import net from 'node:net';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const repository=fileURLToPath(new URL('../../',import.meta.url));
export async function startBuiltSite(){
  const port=await new Promise((resolve,reject)=>{const probe=net.createServer();probe.once('error',reject);probe.listen(0,'127.0.0.1',()=>{const value=probe.address().port;probe.close(()=>resolve(value));});});
  const child=spawn(process.execPath,[path.join(repository,'scripts/start.mjs')],{cwd:repository,env:{...process.env,NODE_ENV:'production',PORT:String(port),WEBSYNK_HOST:'127.0.0.1',WEBSYNK_NOINDEX:'false'},stdio:['ignore','pipe','pipe'],windowsHide:true});
  let output='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
  const stop=async()=>{if(child.exitCode!==null)return;if(process.platform==='win32'&&child.pid)await new Promise(resolve=>{const killer=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});killer.once('close',resolve);killer.once('error',resolve);});else child.kill('SIGTERM');};
  for(let attempt=0;attempt<100;attempt++){
    try{const response=await fetch(`http://127.0.0.1:${port}`,{signal:AbortSignal.timeout(2000)});await response.body?.cancel();if(response.ok)return{origin:`http://127.0.0.1:${port}`,port,stop,output:()=>output};}catch{}
    if(child.exitCode!==null)throw new Error('Website preview exited: '+output.slice(-4000));
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  await stop();throw new Error('Website did not become ready: '+output.slice(-4000));
}
export function requestHost(origin,host,pathname='/'){
  const address=new URL(origin);
  return new Promise((resolve,reject)=>{http.get({hostname:address.hostname,port:address.port,path:pathname,headers:{Host:host}},response=>{response.resume();response.once('end',()=>resolve({status:response.statusCode,headers:response.headers}));}).once('error',reject);});
}
