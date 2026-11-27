import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import dns from 'node:dns/promises';
import { fileURLToPath } from 'node:url';
import { ZipArchive } from 'archiver';
import { z } from 'zod';
import { createMultipartUpload, validateUploadPaths } from './uploads.js';
import { db, jsonSafe } from '../../../packages/database/src/index.js';
import { config, productionUrl, previewUrl, runtimeProductionUrl, runtimePreviewUrl, slugify } from '../../../packages/shared/src/config.js';
import { parseGitHubRepository, normalizeGitHubBranch, normalizeGitHubDirectory } from '../../../packages/shared/src/github-static.js';
import { safePath, inventory } from '../../../packages/storage/src/safe-files.js';
import { activateDeployment, terminalStates } from '../../../packages/deployment-engine/src/index.js';
import { encryptSecret } from '../../../packages/shared/src/secrets.js';
import { deploymentReadiness, workerCapabilitiesKey } from './readiness.js';
import { runtimeActivationProblem } from './deployment-policy.js';

type Identity = {id:string;email:string;name:string;role:string;keyId?:string;scopes:string[];projectId?:string|null};
type AuthRequest = Request & { identity?: Identity };
const wrap = (fn:(request:AuthRequest,response:Response,next:NextFunction)=>Promise<unknown>):express.RequestHandler => (request,response,next)=>{Promise.resolve(fn(request,response,next)).catch(next);};
class HttpError extends Error { constructor(public status:number,message:string) {super(message);} }
const hash = (token:string)=>crypto.createHash('sha256').update(token).digest('hex');
const publicUser = (user:{id:string;name:string;email:string;role:string})=>({id:user.id,name:user.name,email:user.email,role:user.role});
const send = (response:Response,value:unknown)=>response.json(jsonSafe(value));
const parseBoolean = (value:unknown)=>value === true || value === 'true';
const randomToken = ()=>crypto.randomBytes(32).toString('base64url');
const sessionDays = 7;
const cookieOptions = {httpOnly:true,secure:process.env.NODE_ENV === 'production',sameSite:'strict' as const,path:'/api',maxAge:sessionDays*86400000};
async function audit(request:AuthRequest,action:string,projectId?:string,details='') {await db.activityLog.create({data:{userId:request.identity?.id,projectId,action,details}});}
const projectFields = z.object({
  name:z.string().trim().min(1).max(100),slug:z.string().trim().min(1).max(50).optional(),description:z.string().max(2000).optional(),
  framework:z.enum(['auto','static','vite','react','vue','angular','astro','svelte','next-static','next','nuxt','node']).optional(),
  buildCommand:z.string().max(2000).optional(),installCommand:z.string().max(2000).optional(),rootDirectory:z.string().max(200).optional(),outputDirectory:z.string().max(200).optional(),spaFallback:z.boolean().optional(),status:z.enum(['active','disabled','archived']).optional(),
});
const statusError = (message:string,status=400)=>{throw new HttpError(status,message);};
async function authorizedProject(request:AuthRequest,id:string,scope='read') {
  const identity=request.identity!;
  if (!identity.scopes.includes(scope) && !identity.scopes.includes('manage')) statusError('API key is missing the required scope',403);
  if (identity.projectId && identity.projectId !== id) statusError('Project not found',404);
  const project=await db.project.findUnique({where:{id}});
  if (!project) statusError('Project not found',404);
  if (identity.role !== 'super_admin') {
    const member=await db.projectMember.findUnique({where:{userId_projectId:{userId:identity.id,projectId:id}}});
    if (!member) statusError('Project not found',404);
    if (scope !== 'read' && (identity.role === 'viewer' || member!.role === 'viewer')) statusError('Read-only role',403);
  }
  return project!;
}
function requireScope(request:AuthRequest,scope:string) {
  if (!request.identity!.scopes.includes(scope) && !request.identity!.scopes.includes('manage')) statusError('API key is missing the required scope',403);
  if (scope !== 'read' && request.identity!.role === 'viewer') statusError('Read-only role',403);
}
function requireAdmin(request:AuthRequest) {if(request.identity!.role !== 'super_admin' || request.identity!.projectId || !request.identity!.scopes.includes('manage')) statusError('Administrator permission required',403);}
async function scopedProjectIds(request:AuthRequest) {
  if(request.identity!.projectId) return [request.identity!.projectId];
  if(request.identity!.role === 'super_admin') return undefined;
  return (await db.projectMember.findMany({where:{userId:request.identity!.id},select:{projectId:true}})).map(x=>x.projectId);
}
function deploymentJson(deployment:any) {
  const project=deployment.project;
  return {...deployment,...(project ? {project:projectJson(project),productionUrl:productionUrl(project),previewUrl:previewUrl(project,deployment)} : {})};
}
function projectJson(project:any) {
  return {...project,productionUrl:productionUrl(project),deployments:project.deployments?.map((d:any)=>({...d,productionUrl:productionUrl(project),previewUrl:previewUrl(project,d)}))};
}
async function createSession(user:{id:string;name:string;email:string;role:string},response:Response) {
  const token='dhs_'+randomToken();
  await db.session.create({data:{userId:user.id,tokenHash:hash(token),expiresAt:new Date(Date.now()+sessionDays*86400000)}});
  response.cookie('deployhub_session',token,cookieOptions);
  return {user:publicUser(user),token};
}

export async function createApp() {
  await Promise.all([config.uploads,config.workspaces,config.artifacts].map(dir=>fs.mkdir(dir,{recursive:true})));
  const app=express();
  app.disable('x-powered-by');
  app.set('trust proxy',process.env.TRUST_PROXY === 'true' ? 1 : false);
  app.use(helmet({contentSecurityPolicy:false,crossOriginResourcePolicy:{policy:'same-site'}}));
  app.use(express.json({limit:'1mb'}));
  app.use(cookieParser());
  app.get('/healthz',wrap(async(_request,response)=>{await db.$queryRaw`SELECT 1`;send(response,{ok:true,application:'deployhub',service:'api'});}));
  app.use('/api',rateLimit({windowMs:60000,limit:300,standardHeaders:'draft-7',legacyHeaders:false}));
  const router=express.Router();
  router.use((request,response,next)=>{
    const origin=request.headers.origin;
    if (origin && origin !== config.dashboardOrigin) return void response.status(403).json({error:'Untrusted request origin'});
    if (origin) {response.setHeader('Access-Control-Allow-Origin',origin);response.setHeader('Access-Control-Allow-Credentials','true');response.setHeader('Vary','Origin');}
    if (request.method === 'OPTIONS') {response.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,PUT,DELETE,OPTIONS');response.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type,Idempotency-Key,X-Setup-Token');return void response.sendStatus(204);}
    next();
  });
  router.get('/auth/setup',wrap(async(_request,response)=>send(response,{required:await db.user.count() === 0,setupTokenRequired:process.env.NODE_ENV === 'production' || !!process.env.SETUP_TOKEN})));
  router.get('/public/sites/:slug',wrap(async(request,response)=>{
    const project=await db.project.findUnique({where:{slug:request.params.slug}});
    if(!project || project.status!=='active')statusError('Website not found',404);
    const id=typeof request.query.deployment==='string' ? request.query.deployment : project!.currentDeploymentId;
    if(!id)statusError('Website not found',404);
    const deployment=await db.deployment.findFirst({where:{id:id!,projectId:project!.id,status:'live'},include:{artifact:true}});
    if(!deployment?.artifact)statusError('Website not found',404);
    const url=request.query.deployment ? runtimePreviewUrl(project!,deployment!) : runtimeProductionUrl(project!);
    if(new URL(url).origin===new URL(config.dashboardOrigin).origin)statusError('Hosted websites require an independent runtime origin',503);
    response.setHeader('Cache-Control','no-store');send(response,{url,deploymentId:deployment!.id});
  }));
  const authLimiter=rateLimit({windowMs:900000,limit:20,standardHeaders:'draft-7',legacyHeaders:false});
  router.post('/auth/setup',authLimiter,wrap(async(request,response)=>{
    const body=z.object({email:z.string().email().max(254),name:z.string().trim().min(1).max(100),password:z.string().min(12).max(72).refine(value=>Buffer.byteLength(value,'utf8')<=72,'Password must be at most 72 UTF-8 bytes'),setupToken:z.string().optional()}).parse(request.body);
    if (process.env.NODE_ENV === 'production' && !process.env.SETUP_TOKEN) statusError('SETUP_TOKEN must be configured before administrator setup',503);
    if (process.env.SETUP_TOKEN && hash(String(request.headers['x-setup-token'] || body.setupToken || '')) !== hash(process.env.SETUP_TOKEN)) statusError('Valid setup token required',403);
    const passwordHash=await bcrypt.hash(body.password,12);
    const user=await db.$transaction(async tx=>{
      if(await tx.user.count()) statusError('Administrator is already configured',409);
      await tx.applicationSetting.create({data:{key:'initial-admin',value:body.email.toLowerCase()}});
      return tx.user.create({data:{email:body.email.toLowerCase(),name:body.name,passwordHash,role:'super_admin'}});
    });
    response.status(201);send(response,await createSession(user,response));
  }));
  router.post('/auth/login',authLimiter,wrap(async(request,response)=>{
    const body=z.object({email:z.string().email().max(254),password:z.string().max(72).refine(value=>Buffer.byteLength(value,'utf8')<=72,'Password must be at most 72 UTF-8 bytes')}).parse(request.body);
    const user=await db.user.findUnique({where:{email:body.email.toLowerCase()}});
    const valid=user && await bcrypt.compare(body.password,user.passwordHash);
    if(!valid) {await bcrypt.compare(body.password,'$2b$12$IwEvo6sRnuigQJ6iUMoYkOuk9kAaB8LD82eMhaEmGPm8gXtO9f15i');statusError('Invalid email or password',401);}
    await db.activityLog.create({data:{userId:user!.id,action:'auth.login'}});
    send(response,await createSession(user!,response));
  }));
  router.use(wrap(async(request,response,next)=>{
    const bearer=request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
    const token=bearer || request.cookies.deployhub_session;
    if(!token) statusError('Authentication required',401);
    const tokenHash=hash(String(token));
    if(String(token).startsWith('dh_')) {
      const key=await db.apiKey.findUnique({where:{tokenHash},include:{user:true}});
      if(!key || (key.expiresAt && key.expiresAt.getTime()<Date.now())) statusError('API key invalid or expired',401);
      request.identity={...publicUser(key!.user),keyId:key!.id,scopes:JSON.parse(key!.scopes),projectId:key!.projectId};
      await db.apiKey.update({where:{id:key!.id},data:{lastUsedAt:new Date()}});
    } else {
      const session=await db.session.findUnique({where:{tokenHash},include:{user:true}});
      if(!session || session.expiresAt.getTime()<Date.now()) statusError('Session invalid or expired',401);
      request.identity={...publicUser(session!.user),scopes:['read','deploy','manage']};
      if(!bearer && !['GET','HEAD','OPTIONS'].includes(request.method) && request.headers.origin !== config.dashboardOrigin) statusError('A trusted Origin header is required for session writes',403);
    }
    next();
  }));
  router.get('/auth/me',wrap(async(request,response)=>send(response,{user:request.identity})));
  router.get('/capabilities',wrap(async(request,response)=>{
    requireScope(request,'read');
    const report=await db.applicationSetting.findUnique({where:{key:workerCapabilitiesKey}});
    const readiness=deploymentReadiness(report?.value);
    send(response,config.deploymentMode==='legacy' ? {...readiness,deploymentMode:'legacy'} : {...readiness,deploymentMode:'github-static',staticUploadsAvailable:false,sourceBuildsAvailable:false,dynamicRuntimeAvailable:false,supportedRuntimeFrameworks:[],githubStaticAvailable:readiness.workerOnline,reason:readiness.workerOnline?'GitHub static sites are ready. Files stay in the public repository; only deployment metadata is saved.':'Start the deployment worker to verify GitHub static sites.',actions:readiness.workerOnline?[]:['Start or restart the DeployHub worker.']});
  }));
  router.get('/capabilities/setup-guide',wrap(async(request,response)=>{
    requireScope(request,'read');response.type('text/markdown').attachment('DeployHub-runtime-setup.md').sendFile(fileURLToPath(new URL('../../../docs/RUNTIMES.md',import.meta.url)));
  }));
  router.get('/openapi.json',wrap(async(_request,response)=>{response.sendFile(fileURLToPath(new URL('../../../docs/openapi.json',import.meta.url)));}));
  router.post('/auth/logout',wrap(async(request,response)=>{const token=request.cookies.deployhub_session || request.headers.authorization?.replace(/^Bearer /i,'');if(token)await db.session.deleteMany({where:{tokenHash:hash(token)}});response.clearCookie('deployhub_session',{...cookieOptions,maxAge:undefined});send(response,{success:true});}));
  router.get('/projects',wrap(async(request,response)=>{
    requireScope(request,'read');const ids=await scopedProjectIds(request);
    const projects=await db.project.findMany({where:ids ? {id:{in:ids}} : {},include:{deployments:{orderBy:{createdAt:'desc'},take:5}},orderBy:{updatedAt:'desc'}});
    send(response,{projects:projects.map(projectJson)});
  }));
  router.post('/projects',wrap(async(request,response)=>{
    requireScope(request,'manage');if(request.identity!.projectId)statusError('A project-scoped key cannot create projects',403);
    const body=projectFields.parse(request.body);
    if(config.deploymentMode!=='legacy' && ((body.framework && !['auto','static'].includes(body.framework)) || body.buildCommand || body.installCommand))statusError('Only ready static sites from GitHub are supported. Build your site in GitHub Actions first.');
    const base=slugify(body.slug || body.name);
    let slug=base;let suffix=1;
    while(await db.project.findUnique({where:{slug}})) slug=`${base}-${++suffix}`;
    for (const relative of [body.rootDirectory,body.outputDirectory]) if(relative && relative !== '.') safePath(config.workspaces,relative);
    const project=await db.project.create({data:{...body,...(config.deploymentMode!=='legacy'?{framework:'static'}:{}),slug,members:{create:{userId:request.identity!.id,role:'developer'}}}});
    await audit(request,'project.create',project.id);response.status(201);send(response,projectJson(project));
  }));
  router.get('/projects/:id',wrap(async(request,response)=>{await authorizedProject(request,request.params.id);send(response,projectJson(await db.project.findUniqueOrThrow({where:{id:request.params.id},include:{deployments:{orderBy:{createdAt:'desc'}},domains:true}})));}));
  router.patch('/projects/:id',wrap(async(request,response)=>{
    await authorizedProject(request,request.params.id,'manage');const body=projectFields.partial().omit({slug:true}).parse(request.body);
    for(const relative of [body.rootDirectory,body.outputDirectory])if(relative && relative!=='.')safePath(config.workspaces,relative);
    const project=await db.project.update({where:{id:request.params.id},data:body});await audit(request,'project.update',project.id);send(response,projectJson(project));
  }));
  router.delete('/projects/:id',wrap(async(request,response)=>{
    await authorizedProject(request,request.params.id,'manage');
    if(!parseBoolean(request.body.confirm))statusError('Deletion requires confirm: true');
    const pending=await db.deployment.count({where:{projectId:request.params.id,status:{notIn:[...terminalStates]}}});
    if(pending)statusError('Cancel or finish active deployments before deletion',409);
    const deployments=await db.deployment.findMany({where:{projectId:request.params.id},include:{artifact:true}});
    await audit(request,'project.delete',request.params.id);await db.project.delete({where:{id:request.params.id}});
    for(const d of deployments){if(d.uploadPath)await fs.rm(d.uploadPath,{recursive:true,force:true}).catch(()=>{});if(d.artifact?.path)await fs.rm(d.artifact.path,{recursive:true,force:true}).catch(()=>{});}
    send(response,{success:true});
  }));
  const upload=createMultipartUpload({directory:config.uploads,maxBytes:config.maxUploadBytes,maxFiles:config.maxFiles});
  async function queueGitHub(request:AuthRequest,project:{id:string;status:string},input:unknown) {
    if(project.status!=='active')statusError('Restore or enable this project before deploying',409);
    const body=z.object({repository:z.string().trim().min(1).max(300),branch:z.string().trim().max(200).optional(),directory:z.string().trim().max(300).default('.'),environment:z.enum(['preview','production']).default('preview'),authorizeProduction:z.boolean().optional()}).parse(input);
    if(body.environment==='production' && body.authorizeProduction!==true)statusError('Production deployments require authorizeProduction: true');
    try {body.repository=parseGitHubRepository(body.repository).repository;body.directory=normalizeGitHubDirectory(body.directory);if(body.branch)body.branch=normalizeGitHubBranch(body.branch);} catch(error) {statusError((error as Error).message);}
    const id='dpl-'+crypto.randomBytes(6).toString('hex');
    for(let attempt=0;attempt<3;attempt++)try {
      return await db.$transaction(async tx=>{
        const latest=await tx.deployment.findFirst({where:{projectId:project.id},orderBy:{version:'desc'}});
        const deployment=await tx.deployment.create({data:{id,projectId:project.id,environment:body.environment,framework:'static',source:'github',uploadPath:'',version:(latest?.version||0)+1,configuration:JSON.stringify({github:{repository:body.repository,branch:body.branch||'',directory:body.directory}})},include:{project:true,artifact:true}});
        await tx.deploymentLog.create({data:{deploymentId:id,message:'GitHub static site queued. No repository clone, upload, or local website artifact will be created.'}});return deployment;
      });
    } catch(error) {if((error as {code?:string}).code!=='P2002'||attempt===2)throw error;}
    throw new Error('Unable to queue deployment');
  }
  router.post('/projects/:id/github-deployments',wrap(async(request,response)=>{
    const project=await authorizedProject(request,request.params.id,'deploy');
    const deployment=await queueGitHub(request,project,request.body);
    await audit(request,'deployment.github.create',project.id,deployment.id);response.status(202);send(response,deploymentJson(deployment));
  }));
  router.post('/projects/:id/deployments',wrap(async(request,_response,next)=>{await authorizedProject(request,request.params.id,'deploy');if(config.deploymentMode!=='legacy')statusError('File uploads are disabled. Connect a public GitHub repository using github-deployments.',410);next();}),upload,wrap(async(request,response)=>{
    const files=Object.values(request.files || {}).flat() as Express.Multer.File[];
    let retained=false,uploadPath='';
    try {
      const project=await authorizedProject(request,request.params.id,'deploy');
      if(project.status !== 'active')statusError('Restore or enable this project before deploying',409);
      const environment=z.enum(['preview','production']).parse(request.body.environment || 'preview');
      const overrides=projectFields.pick({framework:true,buildCommand:true,installCommand:true,rootDirectory:true,outputDirectory:true,spaFallback:true}).partial().parse(request.body);
      for(const relative of [overrides.rootDirectory,overrides.outputDirectory])if(relative && relative!=='.')safePath(config.workspaces,relative);
      if(environment==='production' && !parseBoolean(request.body.authorizeProduction))statusError('Production deployments require authorizeProduction: true');
      const idempotency=String(request.headers['idempotency-key'] || '');
      if(idempotency.length>200)statusError('Idempotency key exceeds 200 characters');
      const settingKey=idempotency ? `idem:${hash(request.identity!.id+':'+project.id+':'+idempotency)}` : null;
      if(settingKey){const existing=await db.applicationSetting.findUnique({where:{key:settingKey}});if(existing){const deployment=await db.deployment.findUniqueOrThrow({where:{id:existing.value},include:{project:true,artifact:true}});response.status(200);return send(response,deploymentJson(deployment));}}
      if(!files.length)statusError('Upload an archive or website files');
      if(files.reduce((sum,file)=>sum+file.size,0)>config.maxUploadBytes)statusError('Upload exceeds total size limit',413);
      const id='dpl-'+crypto.randomBytes(6).toString('hex');
      const fields=request.files as Record<string,Express.Multer.File[]>;
      const archive=fields.archive?.[0] || fields.file?.[0];
      if(archive){
        if(files.length!==1 || !archive.originalname.toLowerCase().endsWith('.zip'))statusError('Archive upload must contain exactly one ZIP file');
        uploadPath=path.join(config.uploads,id+'.zip');await fs.rename(archive.path,uploadPath);
      } else {
        uploadPath=path.join(config.uploads,id);await fs.mkdir(uploadPath,{recursive:true});
        const paths=validateUploadPaths(uploadPath,request.body.paths,files.length);
        for(let i=0;i<files.length;i++){
          const target=safePath(uploadPath,paths[i]);
          await fs.mkdir(path.dirname(target),{recursive:true});await fs.rename(files[i].path,target);
        }
      }
      const latest=await db.deployment.findFirst({where:{projectId:project.id},orderBy:{version:'desc'}});
      const deployment=await db.$transaction(async tx=>{
        const created=await tx.deployment.create({data:{id,projectId:project.id,environment,version:(latest?.version || 0)+1,configuration:JSON.stringify(overrides),uploadPath,source:String(request.body.source || 'upload').slice(0,100)},include:{project:true,artifact:true}});
        if(settingKey)await tx.applicationSetting.create({data:{key:settingKey,value:id}});
        await tx.deploymentLog.create({data:{deploymentId:id,message:'Upload validated and queued for deployment.'}});return created;
      });
      retained=true;await audit(request,'deployment.create',project.id,id);response.status(202);send(response,deploymentJson(deployment));
    } finally {
      await Promise.all(files.map(file=>fs.rm(file.path,{force:true}).catch(()=>{})));
      if(!retained && uploadPath)await fs.rm(uploadPath,{recursive:true,force:true}).catch(()=>{});
    }
  }));
  router.get('/deployments',wrap(async(request,response)=>{
    requireScope(request,'read');const ids=await scopedProjectIds(request);
    const deployments=await db.deployment.findMany({where:ids ? {projectId:{in:ids}} : {},orderBy:{createdAt:'desc'},take:200,include:{project:true,artifact:true}});send(response,{deployments:deployments.map(deploymentJson)});
  }));
  router.get('/deployments/:id',wrap(async(request,response)=>{const deployment=await db.deployment.findUnique({where:{id:request.params.id},include:{project:true,artifact:true}});if(!deployment)statusError('Deployment not found',404);await authorizedProject(request,deployment!.projectId);send(response,deploymentJson(deployment));}));
  router.get('/deployments/:id/logs',wrap(async(request,response)=>{
    const deployment=await db.deployment.findUnique({where:{id:request.params.id}});if(!deployment)statusError('Deployment not found',404);await authorizedProject(request,deployment!.projectId);
    const after=Math.max(0,Number(request.query.after)||0);
    if(request.query.stream==='1'){
      response.setHeader('Content-Type','text/event-stream');response.setHeader('Cache-Control','no-cache');response.setHeader('Connection','keep-alive');response.setHeader('X-Accel-Buffering','no');response.flushHeaders();
      let cursor=after,closed=false;request.on('close',()=>{closed=true;clearInterval(timer);});
      const tick=async()=>{if(closed)return;const logs=await db.deploymentLog.findMany({where:{deploymentId:deployment!.id,id:{gt:cursor}},orderBy:{id:'asc'},take:500});for(const entry of logs){cursor=entry.id;response.write(`id: ${entry.id}\nevent: log\ndata: ${JSON.stringify(entry)}\n\n`);}const latest=await db.deployment.findUnique({where:{id:deployment!.id}});response.write(`event: deployment\ndata: ${JSON.stringify({id:latest?.id,status:latest?.status})}\n\n`);if(latest && terminalStates.has(latest.status)){clearInterval(timer);response.end();}};
      const timer=setInterval(()=>{void tick().catch(()=>{clearInterval(timer);response.end();});},1000);await tick();
    } else send(response,{logs:await db.deploymentLog.findMany({where:{deploymentId:deployment!.id,id:{gt:after}},orderBy:{id:'asc'},take:2000})});
  }));
  router.post('/deployments/:id/cancel',wrap(async(request,response)=>{const deployment=await db.deployment.findUnique({where:{id:request.params.id}});if(!deployment)statusError('Deployment not found',404);await authorizedProject(request,deployment!.projectId,'deploy');if(terminalStates.has(deployment!.status))statusError('Deployment is already finished',409);const result=await db.deployment.update({where:{id:deployment!.id},data:{status:'cancelled'}});await audit(request,'deployment.cancel',deployment!.projectId,deployment!.id);send(response,result);}));
  router.post('/deployments/:id/retry',wrap(async(request,response)=>{
    const original=await db.deployment.findUnique({where:{id:request.params.id}});
    if(!original)statusError('Deployment not found',404);
    const project=await authorizedProject(request,original!.projectId,'deploy');
    if(project.status!=='active')statusError('Restore or enable this project before retrying',409);
    if(!terminalStates.has(original!.status))statusError('Wait for this deployment to finish or cancel it before retrying',409);
    const body=z.object({environment:z.enum(['preview','production']).default('preview'),authorizeProduction:z.boolean().optional()}).parse(request.body || {});
    if(body.environment==='production' && body.authorizeProduction!==true)statusError('Production retries require authorizeProduction: true');
    if(original!.source==='github'){
      const github=JSON.parse(original!.configuration).github;
      const deployment=await queueGitHub(request,project,{repository:github.repository,branch:github.branch,directory:github.directory,...body});
      await audit(request,'deployment.github.retry',project.id,deployment.id);response.status(202);return send(response,deploymentJson(deployment));
    }
    if(config.deploymentMode!=='legacy')statusError('Retained uploads cannot be retried in GitHub static mode. Connect the repository instead.',410);
    const relative=path.relative(config.uploads,original!.uploadPath);
    if(!relative || relative==='..' || relative.startsWith('..'+path.sep) || path.isAbsolute(relative))statusError('Retained deployment source is unavailable',409);
    const stat=await fs.lstat(original!.uploadPath).catch(()=>null);
    if(!stat || stat.isSymbolicLink() || (!stat.isDirectory()&&!stat.isFile()))statusError('Retained deployment source is unavailable. Upload the website again.',409);
    if(stat!.isDirectory())await inventory(original!.uploadPath);
    const id='dpl-'+crypto.randomBytes(6).toString('hex');
    const uploadPath=path.join(config.uploads,id+(stat!.isDirectory()?'':'.zip'));
    let retained=false;
    try {
      if(stat!.isDirectory())await fs.cp(original!.uploadPath,uploadPath,{recursive:true,dereference:false,errorOnExist:true,force:false});
      else await fs.copyFile(original!.uploadPath,uploadPath);
      let result:any;
      for(let attempt=0;attempt<3;attempt++) {
        try {
          result=await db.$transaction(async tx=>{
            const latest=await tx.deployment.findFirst({where:{projectId:project.id},orderBy:{version:'desc'}});
            const created=await tx.deployment.create({data:{id,projectId:project.id,status:'queued',environment:body.environment,version:(latest?.version || 0)+1,configuration:original!.configuration,uploadPath,source:'retry'},include:{project:true,artifact:true}});
            await tx.deploymentLog.create({data:{deploymentId:id,message:`Retry queued from retained source ${original!.id}; previous production is preserved until verification.`}});
            return created;
          });break;
        } catch(error) {if((error as {code?:string}).code!=='P2002'||attempt===2)throw error;}
      }
      retained=true;await audit(request,'deployment.retry',project.id,original!.id+' -> '+id);response.status(202);send(response,deploymentJson(result));
    } finally {if(!retained)await fs.rm(uploadPath,{recursive:true,force:true}).catch(()=>{});}
  }));
  for(const action of ['promote','rollback'])router.post(`/deployments/:id/${action}`,wrap(async(request,response)=>{const deployment=await db.deployment.findUnique({where:{id:request.params.id},include:{artifact:true}});if(!deployment)statusError('Deployment not found',404);await authorizedProject(request,deployment!.projectId,'deploy');if(!parseBoolean(request.body.authorizeProduction))statusError('Production changes require authorizeProduction: true');const problem=runtimeActivationProblem(deployment!);if(problem)statusError(problem,409);const result=await activateDeployment(deployment!.id);await audit(request,`deployment.${action}`,result.projectId,result.id);send(response,deploymentJson(result));}));
  router.get('/deployments/:id/artifact',wrap(async(request,response)=>{
    const deployment=await db.deployment.findUnique({where:{id:request.params.id},include:{artifact:true}});if(!deployment)statusError('Deployment not found',404);await authorizedProject(request,deployment!.projectId);if(!deployment!.artifact || deployment!.status!=='live')statusError('Artifact unavailable',404);
    if((deployment!.artifact as {kind?:string})?.kind==='runtime')statusError('This deployment is a container image. Static ZIP download is unavailable for server applications.',409);
    if(deployment!.artifact!.kind==='github-static')statusError('Website files stay on GitHub. Download them from the connected repository.',409);
    response.attachment(`${deployment!.id}.zip`);const archive=new ZipArchive({zlib:{level:6}});archive.on('error',error=>response.destroy(error));archive.pipe(response);archive.directory(deployment!.artifact!.path,false);await archive.finalize();
  }));
  async function fileRoot(request:AuthRequest){const project=await authorizedProject(request,request.params.id);if(!project.currentDeploymentId)statusError('No production deployment',404);const artifact=await db.deploymentArtifact.findUnique({where:{deploymentId:project.currentDeploymentId!}});if(!artifact)statusError('Artifact not found',404);if(artifact!.kind==='github-static')statusError('Website files stay on GitHub. Browse and edit them in the connected repository.',409);if((artifact as {kind?:string})?.kind==='runtime')statusError('This website runs in an immutable container. Update its uploaded source instead of browsing a static artifact.',409);return artifact!.path;}
  router.get('/projects/:id/files',wrap(async(request,response)=>{
    const root=await fileRoot(request);const relative=String(request.query.path || '');const directory=relative ? safePath(root,relative) : root;
    const stat=await fs.lstat(directory);if(!stat.isDirectory() || stat.isSymbolicLink())statusError('Not a directory');
    const entries=await fs.readdir(directory,{withFileTypes:true});const files=await Promise.all(entries.map(async entry=>{const stat=await fs.lstat(path.join(directory,entry.name));return{name:entry.name,path:(relative ? relative+'/' : '')+entry.name,type:entry.isDirectory()?'directory':'file',sizeBytes:stat.size};}));send(response,{path:relative,files});
  }));
  router.get('/projects/:id/files/content',wrap(async(request,response)=>{const root=await fileRoot(request);const file=safePath(root,String(request.query.path || ''));const stat=await fs.lstat(file);if(!stat.isFile() || stat.isSymbolicLink() || stat.size>1048576)statusError('Only regular files up to 1 MiB can be previewed');response.type('text/plain').send(await fs.readFile(file));}));
  router.get('/api-keys',wrap(async(request,response)=>{requireScope(request,'read');const keys=await db.apiKey.findMany({where:{userId:request.identity!.id,...(request.identity!.projectId ? {projectId:request.identity!.projectId}: {})},orderBy:{createdAt:'desc'}});send(response,{keys:keys.map(({tokenHash,...key})=>({...key,scopes:JSON.parse(key.scopes)}))});}));
  router.get('/projects/:id/environment',wrap(async(request,response)=>{
    await authorizedProject(request,request.params.id,'manage');
    const variables=await db.environmentVariable.findMany({where:{projectId:request.params.id},select:{id:true,name:true,environment:true},orderBy:{name:'asc'}});send(response,{variables});
  }));
  router.put('/projects/:id/environment',wrap(async(request,response)=>{
    await authorizedProject(request,request.params.id,'manage');
    const body=z.object({name:z.string().regex(/^[A-Z_][A-Z0-9_]{0,127}$/),value:z.string().min(1).max(8192).refine(value=>!/[\r\n\0]/.test(value),'Secret values must fit on one line'),environment:z.enum(['production','preview']).default('production')}).parse(request.body);
    if(['HOME','PATH','NODE_OPTIONS','LD_PRELOAD','LD_LIBRARY_PATH','BASH_ENV','ENV','DOCKER_HOST','DOCKER_CONFIG'].includes(body.name))statusError('This environment variable is reserved for build isolation');
    const ciphertext=encryptSecret(body.value);
    const variable=await db.environmentVariable.upsert({where:{projectId_name_environment:{projectId:request.params.id,name:body.name,environment:body.environment}},create:{projectId:request.params.id,name:body.name,environment:body.environment,ciphertext},update:{ciphertext},select:{id:true,name:true,environment:true}});
    await audit(request,'environment.set',request.params.id,body.name);send(response,variable);
  }));
  router.delete('/projects/:id/environment/:variableId',wrap(async(request,response)=>{await authorizedProject(request,request.params.id,'manage');await db.environmentVariable.deleteMany({where:{id:request.params.variableId,projectId:request.params.id}});await audit(request,'environment.delete',request.params.id);send(response,{success:true});}));
  router.post('/api-keys',wrap(async(request,response)=>{
    requireAdmin(request);const body=z.object({name:z.string().trim().min(1).max(100),scopes:z.array(z.enum(['read','deploy','manage'])).min(1),projectId:z.string().optional(),expiresAt:z.string().datetime().optional()}).parse(request.body);
    if(body.projectId)await authorizedProject(request,body.projectId,'manage');if(body.expiresAt && Date.parse(body.expiresAt)<Date.now())statusError('Expiration must be in the future');
    const token='dh_'+randomToken();const key=await db.apiKey.create({data:{...body,scopes:JSON.stringify(body.scopes),tokenHash:hash(token),prefix:token.slice(0,11),userId:request.identity!.id,expiresAt:body.expiresAt ? new Date(body.expiresAt):null}});
    const {tokenHash,...safe}=key;await audit(request,'apikey.create',body.projectId,key.id);response.status(201);send(response,{token,key:{...safe,scopes:body.scopes}});
  }));
  router.delete('/api-keys/:id',wrap(async(request,response)=>{requireAdmin(request);await db.apiKey.deleteMany({where:{id:request.params.id,userId:request.identity!.id}});await audit(request,'apikey.revoke',undefined,request.params.id);send(response,{success:true});}));
  router.get('/domains',wrap(async(request,response)=>{requireScope(request,'read');const ids=await scopedProjectIds(request);send(response,{domains:await db.domain.findMany({where:ids?{projectId:{in:ids}}:{},include:{project:true}})});}));
  router.get('/projects/:id/domains',wrap(async(request,response)=>{await authorizedProject(request,request.params.id);send(response,{domains:await db.domain.findMany({where:{projectId:request.params.id}})});}));
  router.post('/projects/:id/domains',wrap(async(request,response)=>{
    await authorizedProject(request,request.params.id,'manage');const {hostname}=z.object({hostname:z.string().trim().toLowerCase().min(4).max(253).regex(/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/)}).parse(request.body);
    if(hostname===config.siteDomain || hostname.endsWith('.'+config.siteDomain) || hostname===new URL(config.dashboardOrigin).hostname)statusError('This hostname is reserved');
    const domain=await db.domain.create({data:{hostname,projectId:request.params.id,verificationToken:'deployhub-verification='+randomToken()}});await audit(request,'domain.add',request.params.id,hostname);response.status(201);send(response,{...domain,dnsRecords:[{type:'TXT',name:`_deployhub.${hostname}`,value:domain.verificationToken},{type:'CNAME',name:hostname,value:config.siteDomain}]});
  }));
  router.post('/domains/:id/verify',wrap(async(request,response)=>{
    const domain=await db.domain.findUnique({where:{id:request.params.id}});if(!domain)statusError('Domain not found',404);await authorizedProject(request,domain!.projectId,'manage');
    const records=await dns.resolveTxt(`_deployhub.${domain!.hostname}`).catch(()=>[]);
    if(!records.some(parts=>parts.join('')===domain!.verificationToken))return void response.status(409).json({error:'Ownership TXT record not found',verified:false});
    const result=await db.domain.update({where:{id:domain!.id},data:{verifiedAt:new Date(),sslStatus:'awaiting_proxy'}});await audit(request,'domain.verify',domain!.projectId,domain!.hostname);send(response,result);
  }));
  router.delete('/domains/:id',wrap(async(request,response)=>{const domain=await db.domain.findUnique({where:{id:request.params.id}});if(!domain)statusError('Domain not found',404);await authorizedProject(request,domain!.projectId,'manage');await db.domain.delete({where:{id:domain!.id}});await audit(request,'domain.delete',domain!.projectId,domain!.hostname);send(response,{success:true});}));
  router.get('/overview',wrap(async(request,response)=>{
    requireScope(request,'read');const ids=await scopedProjectIds(request);const where=ids?{id:{in:ids}}:{};const dwhere=ids?{projectId:{in:ids}}:{};
    const [projects,successfulDeployments,failedDeployments,pendingDeployments,storage,recent]=await Promise.all([db.project.findMany({where,include:{deployments:{take:1,orderBy:{createdAt:'desc'}}},orderBy:{updatedAt:'desc'}}),db.deployment.count({where:{...dwhere,status:'live'}}),db.deployment.count({where:{...dwhere,status:'failed'}}),db.deployment.count({where:{...dwhere,status:{notIn:[...terminalStates]}}}),db.deploymentArtifact.aggregate({_sum:{sizeBytes:true},where:ids?{deployment:{projectId:{in:ids}}}:{}}),db.deployment.findMany({where:dwhere,orderBy:{createdAt:'desc'},take:12,include:{project:true,artifact:true}})]);
    send(response,{totalProjects:projects.length,activeProjects:projects.filter(p=>p.status==='active' && p.currentDeploymentId).length,successfulDeployments,failedDeployments,pendingDeployments,storageBytes:storage._sum.sizeBytes || 0,recentDeployments:recent.map(deploymentJson),projects:projects.map(projectJson)});
  }));
  let previousCpu=os.cpus().map(cpu=>cpu.times),previousAt=Date.now();
  router.get('/metrics',wrap(async(request,response)=>{
    requireAdmin(request);const current=os.cpus().map(cpu=>cpu.times);let idle=0,total=0;
    current.forEach((times,i)=>{const before=previousCpu[i] || times;idle+=times.idle-before.idle;total+=Object.values(times).reduce((a,b)=>a+b,0)-Object.values(before).reduce((a,b)=>a+b,0);});
    const intervalMs=Date.now()-previousAt;previousAt=Date.now();previousCpu=current;
    const disk=await fs.statfs(config.dataDirectory);const queueDepth=await db.deployment.count({where:{status:'queued'}});const activeSites=await db.project.count({where:{status:'active',currentDeploymentId:{not:null}}});
    const container=await fs.access('/.dockerenv').then(()=>true,()=>false);
    let memoryUsedBytes=os.totalmem()-os.freemem(),memoryTotalBytes=os.totalmem(),scope=container?'host-visible-from-container':'host';
    if(container){const usage=await fs.readFile('/sys/fs/cgroup/memory.current','utf8').then(Number,()=>NaN);const limit=await fs.readFile('/sys/fs/cgroup/memory.max','utf8').then(Number,()=>NaN);if(Number.isFinite(usage)&&Number.isFinite(limit)){memoryUsedBytes=usage;memoryTotalBytes=limit;scope='service-container';}}
    send(response,{cpuPercent:total?Math.round((1-idle/total)*1000)/10:null,cpuScope:'host-visible',memoryUsedBytes,memoryTotalBytes,uptimeSeconds:os.uptime(),processUptimeSeconds:process.uptime(),diskTotalBytes:Number(disk.blocks)*Number(disk.bsize),diskFreeBytes:Number(disk.bavail)*Number(disk.bsize),queueDepth,activeSites,scope,sampleIntervalMs:intervalMs,runningContainers:null,bandwidthBytes:null,certificateExpiry:null});
  }));
  router.get('/activity',wrap(async(request,response)=>{requireScope(request,'read');const ids=await scopedProjectIds(request);send(response,{activities:await db.activityLog.findMany({where:ids?{projectId:{in:ids}}:{},orderBy:{createdAt:'desc'},take:100})});}));
  router.get('/settings',wrap(async(request,response)=>{requireAdmin(request);send(response,{siteDomain:config.siteDomain,siteProtocol:config.siteProtocol,maxUploadBytes:config.maxUploadBytes,maxExtractedBytes:config.maxExtractedBytes,maxFiles:config.maxFiles,buildEnabled:process.env.BUILD_DOCKER_ENABLED==='true',dashboardOrigin:config.dashboardOrigin});}));
  router.get('/sessions',wrap(async(request,response)=>{send(response,{sessions:await db.session.findMany({where:{userId:request.identity!.id},select:{id:true,createdAt:true,expiresAt:true},orderBy:{createdAt:'desc'}})});}));
  router.delete('/sessions/:id',wrap(async(request,response)=>{await db.session.deleteMany({where:{id:request.params.id,userId:request.identity!.id}});send(response,{success:true});}));
  router.use((_request,response)=>response.status(404).json({error:'API endpoint not found'}));
  app.use('/api/v1',router);
  app.use((error:any,_request:Request,response:Response,_next:NextFunction)=>{
    if(response.headersSent)return void response.end();
    if(error instanceof z.ZodError)return void response.status(400).json({error:'Validation failed',details:error.issues.map(({path,message})=>({path:path.join('.'),message}))});
    if(error instanceof multer.MulterError)return void response.status(413).json({error:error.message});
    if(error instanceof SyntaxError)return void response.status(400).json({error:'Invalid JSON request field'});
    if(/^ENCRYPTION_KEY must/.test(error.message || ''))return void response.status(503).json({error:error.message});
    if(/^(Unsafe file path|Path escapes project directory|Duplicate upload path)/.test(error.message || ''))return void response.status(400).json({error:error.message});
    if(error.code==='P2002')return void response.status(409).json({error:'A record with these unique fields already exists'});
    if(error.code==='P2025' || error.code==='ENOENT')return void response.status(404).json({error:'Resource not found'});
    const status=error.status || 500;
    if(status===500)console.error('API request error:',error.message);
    response.status(status).json({error:status===500?'Internal server error':error.message});
  });
  return app;
}
