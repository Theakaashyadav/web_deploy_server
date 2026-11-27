import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '../../../packages/database/src/index.js';
import { config } from '../../../packages/shared/src/config.js';
import { safePath } from '../../../packages/storage/src/safe-files.js';
import { proxyRuntime, proxyRuntimeUpgrade } from '../../../packages/runtime-adapters/src/proxy.js';
import { assertGitHubStaticSource, fetchGitHubStaticFile, normalizeGitHubFilePath } from '../../../packages/shared/src/github-static.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy',false);
app.get('/healthz',(_request,response)=>{response.json({ok:true,application:'deployhub',service:'runtime'});});
async function resolveHost(host: string) {
  if (host.endsWith('.'+config.siteDomain)) {
    const label = host.slice(0,-config.siteDomain.length-1);
    const separator = label.indexOf('--');
    if (separator !== -1) {
      const slug = label.slice(0,separator), id = label.slice(separator+2);
      const deployment = await db.deployment.findFirst({where:{id,project:{slug,status:'active'}},include:{artifact:true,project:true}});
      if (!deployment || !deployment.artifact || !['live','verifying'].includes(deployment.status)) return null;
      return {project:deployment.project,deployment,artifact:deployment.artifact};
    }
    const project = await db.project.findUnique({where:{slug:label}});
    if (!project?.currentDeploymentId || project.status !== 'active') return null;
    const deployment = await db.deployment.findUnique({where:{id:project.currentDeploymentId},include:{artifact:true}});
    return deployment?.artifact && deployment.status === 'live' ? {project,deployment,artifact:deployment.artifact} : null;
  }
  const domain = await db.domain.findUnique({where:{hostname:host},include:{project:true}});
  if (!domain?.verifiedAt || domain.project.status !== 'active' || !domain.project.currentDeploymentId) return null;
  const deployment = await db.deployment.findUnique({where:{id:domain.project.currentDeploymentId},include:{artifact:true}});
  return deployment?.artifact && deployment.status === 'live' ? {project:domain.project,deployment,artifact:deployment.artifact} : null;
}
app.get('/internal/tls/ask',async(request,response)=>{
  try {
    const hostname = String(request.query.domain || '').toLowerCase();
    if (!/^[a-z0-9.-]{1,253}$/.test(hostname)) return void response.sendStatus(403);
    const result = await resolveHost(hostname);
    response.sendStatus(result ? 200 : 403);
  } catch { response.sendStatus(503); }
});
app.use(async(request,response,next)=>{
  try {
    const host = request.headers.host?.split(':')[0].toLowerCase() || '';
    const target = await resolveHost(host);
    if (!target) return void response.status(404).type('text').send('Website not found or not yet deployed.');
    if(target.artifact.kind==='runtime'){
      if(!target.artifact.runtimeEndpoint)return void response.status(503).type('text').send('The application runtime has no verified private endpoint.');
      proxyRuntime(request,response,{endpoint:target.artifact.runtimeEndpoint,container:target.artifact.runtimeContainer||undefined,deploymentId:target.deployment.id,protocol:config.siteProtocol});
      return;
    }
    if(target.artifact.kind==='github-static'){
      if(!['GET','HEAD'].includes(request.method))return void response.sendStatus(405);
      let file:string;
      try {
        file=decodeURIComponent(request.path).replace(/^\//,'');
        // Directory URLs keep their trailing slash so relative assets resolve in the browser.
        if(file && !file.endsWith('/') && !path.posix.extname(file)){
          normalizeGitHubFilePath(file+'/');
          response.setHeader('Location',request.path+'/'+(request.url.includes('?')?request.url.slice(request.url.indexOf('?')):''));
          return void response.status(308).end();
        }
        normalizeGitHubFilePath(file);
      }catch{return void response.sendStatus(404);}
      const source:unknown=JSON.parse(target.deployment.configuration).github;
      assertGitHubStaticSource(source);
      let result=await fetchGitHubStaticFile(source,file);
      if(result.status===404 && target.project.spaFallback && !path.posix.extname(file))result=await fetchGitHubStaticFile(source,'index.html');
      response.setHeader('X-Content-Type-Options','nosniff');
      response.setHeader('Referrer-Policy','no-referrer');
      response.setHeader('Cache-Control','no-store');
      response.setHeader('X-DeployHub-Deployment',target.deployment.id);
      // A site can register a worker only within its own independent runtime origin.
      response.setHeader('Content-Type',result.contentType);
      if(result.status===404)return void response.status(404).type('text').send('Page not found');
      response.setHeader('Content-Length',result.body.length);
      if(request.method==='HEAD')return void response.status(200).end();
      return void response.status(200).end(result.body);
    }
    let decoded: string;
    try { decoded=decodeURIComponent(request.path); } catch { return void response.sendStatus(400); }
    if (decoded.split('/').some(part=>part.startsWith('.') || /^(?:package(?:-lock)?\.json|deployhub\.json|.*\.(?:pem|key|p12|pfx))$/i.test(part))) return void response.sendStatus(404);
    response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    response.setHeader('Cache-Control','public, max-age=60');
    response.setHeader('X-DeployHub-Deployment',target.deployment.id);
    express.static(target.artifact.path,{dotfiles:'deny',etag:true,lastModified:true,fallthrough:true,maxAge:'1m',index:'index.html'})(request,response,async(error?:unknown)=>{
      if (error) return next(error);
      if (!['GET','HEAD'].includes(request.method)) return void response.sendStatus(405);
      if (target.project.spaFallback && !path.extname(decoded)) return void response.sendFile(path.join(target.artifact.path,'index.html'));
      const custom404 = safePath(target.artifact.path,'404.html');
      if (await fs.access(custom404).then(()=>true,()=>false)) response.status(404).sendFile(custom404);
      else response.status(404).type('text').send('Page not found');
    });
  } catch(error) { next(error); }
});
app.use((_error:unknown,_request:express.Request,response:express.Response,_next:express.NextFunction)=>{ response.status(503).type('text').send('Website runtime temporarily unavailable.'); });
const server = app.listen(config.runtimePort,'0.0.0.0',()=>console.log(`DeployHub runtime listening on :${config.runtimePort}`));
server.on('upgrade',(request,socket,head)=>{
  const hostname=request.headers.host?.split(':')[0].toLowerCase()||'';
  void resolveHost(hostname).then(target=>{
    if(!target || target.artifact.kind!=='runtime' || !target.artifact.runtimeEndpoint){socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');return;}
    proxyRuntimeUpgrade(request,socket as import('node:net').Socket,head,{endpoint:target.artifact.runtimeEndpoint,container:target.artifact.runtimeContainer||undefined,deploymentId:target.deployment.id,protocol:config.siteProtocol});
  }).catch(()=>socket.destroy());
});
const quit=()=>{server.close(()=>{void db.$disconnect().then(()=>process.exit(0));});};
process.on('SIGTERM',quit); process.on('SIGINT',quit);
