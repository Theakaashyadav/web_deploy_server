import path from 'node:path';

export type RuntimeDatabase = {provider:string;environmentVariable?:string;schemaPath?:string;hasMigrations:boolean;generateCommand?:string;migrationCommand?:string};
export type RuntimeMetadata = {image:string;container:string;endpoint:string;path:string;sizeBytes:number;sha256:string};
export type RuntimeBuildOptions = {
  id:string;projectId:string;environment:string;appUrl:string;sourceDirectory:string;projectRootRelative?:string;
  framework:string;installCommand:string;buildCommand:string;startCommand:string;runtimePrepareCommand?:string;
  variables:Record<string,string>;database?:RuntimeDatabase;installationId?:string;
  onLog:(message:string,level?:string)=>Promise<unknown>|unknown;
  onStage?:(stage:string,message:string)=>Promise<unknown>|unknown;
  isCancelled?:()=>Promise<boolean>;
};

export function runtimeNames(id:string,projectId:string,environment:string) {
  if(!/^dpl-[a-z0-9-]{6,40}$/.test(id))throw new Error('Invalid runtime deployment ID');
  if(!/^[a-zA-Z0-9-]{1,80}$/.test(projectId))throw new Error('Invalid runtime project ID');
  const suffix=environment==='production'?`project-${projectId.toLowerCase()}`:`preview-${id}`;
  return {container:`deployhub-runtime-${id}`,builder:`deployhub-build-${id}`,image:`deployhub/${id}:immutable`,volume:`deployhub-data-${suffix}`};
}
export const shellQuote=(value:string)=>"'"+value.replaceAll("'","'\\''")+"'";
export function projectRelative(value='.') {
  if(value==='.' || !value)return '';
  if(value.includes('\\') || value.startsWith('/') || /^[a-z]:/i.test(value) || value.includes('\0') || value.split('/').some(part=>!part||part==='..'||part==='.'))throw new Error('Unsafe runtime project directory');
  return value;
}
export function validateRuntimeEndpoint(value:string,container?:string) {
  const url=new URL(value);
  const privateContainer=/^deployhub-runtime-dpl-[a-z0-9-]{6,40}$/;
  const allowedHost=url.hostname==='127.0.0.1'||url.hostname==='[::1]'||(privateContainer.test(url.hostname)&&(!container||url.hostname===container));
  if(url.protocol!=='http:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||!allowedHost||!url.port)throw new Error('Invalid private runtime endpoint');
  return url;
}

/** Generated context: uploaded Dockerfiles are never executed. There are no build-time RUN instructions. */
export function trustedRuntimeDockerfile(baseImage:string,relative:string,startCommand:string) {
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{0,240}$/.test(baseImage))throw new Error('Invalid trusted runtime base image');
  const root=projectRelative(relative);
  return [
    `FROM ${baseImage}`,'COPY --chown=1000:1000 app/ /app/','COPY --chown=1000:1000 data/ /app-data/',
    `WORKDIR ${JSON.stringify('/app'+(root?'/'+root:''))}`,'USER 1000:1000',
    'ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 HOST=0.0.0.0 NEXT_TELEMETRY_DISABLED=1','EXPOSE 3000',
    `CMD ${JSON.stringify(['sh','-ec',startCommand])}`,'',
  ].join('\n');
}

export function runtimeContainerArguments(options:{id:string;projectId:string;environment:string;image:string;network:string;envFile:string;rootRelative?:string;sqlite:boolean;gateway:'host'|'network';installationId?:string}) {
  const names=runtimeNames(options.id,options.projectId,options.environment);
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,80}$/.test(options.network))throw new Error('Invalid runtime network name');
  const root=projectRelative(options.rootRelative);
  const configuredMemory=Number(process.env.RUNTIME_MEMORY_MB||1024);
  const memory=Number.isSafeInteger(configuredMemory)&&configuredMemory>=128&&configuredMemory<=16384?configuredMemory:1024;
  return [
    'run','--detach','--name',names.container,'--restart','unless-stopped','--user','1000:1000',
    '--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--cpus','1','--memory',`${memory}m`,'--memory-swap',`${memory}m`,'--pids-limit','128',
    '--network',options.network,'--network-alias',names.container,
    '--label','io.deployhub.managed=1','--label',`io.deployhub.deployment=${options.id}`,
    '--label',`io.deployhub.project=${options.projectId}`,
    ...(options.installationId?['--label',`io.deployhub.installation=${options.installationId}`]:[]),
    '--tmpfs','/tmp:rw,nosuid,nodev,size=128m,mode=1777',
    '--tmpfs',`/app${root?'/'+root:''}/.next/cache:rw,nosuid,nodev,size=128m,mode=1777`,
    '--mount',`type=volume,src=${names.volume},dst=/app-data`,
    ...(options.gateway==='host'?['--publish','127.0.0.1::3000']:[]),
    '--env-file',options.envFile,
    '--health-cmd',`node -e "fetch('http://127.0.0.1:3000/',{redirect:'manual'}).then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"`,
    '--health-interval','15s','--health-timeout','5s','--health-retries','3','--health-start-period','30s',
    options.image,
  ];
}

export function runtimeStartupCommand(options:RuntimeBuildOptions,autoSqlite:boolean) {
  if(!options.startCommand.trim())throw new Error('No runtime start command was detected. Add a start script to package.json.');
  if(!autoSqlite)return options.startCommand;
  const database=options.database!;
  const migration=database.migrationCommand || (database.hasMigrations?'npm exec --no -- prisma migrate deploy':'npm exec --no -- prisma db push --skip-generate');
  // Existing project databases are deliberately not changed before a candidate passes verification.
  return `if [ ! -f /app-data/.deployhub-initialized ]; then touch /app-data/site.db; ${migration}; touch /app-data/.deployhub-initialized; fi; exec sh -ec ${shellQuote(options.startCommand)}`;
}

/** Dependency installers need development packages; the application build itself always runs in production mode. */
export function runtimeBuildCommand(options:RuntimeBuildOptions,autoSqlite:boolean) {
  const relative=projectRelative(options.projectRootRelative);
  const root='/app'+(relative?'/'+relative:'');
  const generate=options.database?.generateCommand||'';
  const initialize=autoSqlite?(options.database?.migrationCommand||(options.database?.hasMigrations?'npm exec --no -- prisma migrate deploy':'npm exec --no -- prisma db push --skip-generate')):'';
  return [
    'cp -R /source/. /app/',`cd ${shellQuote(root)}`,options.installCommand||'true',
    'export NODE_ENV=production','mkdir -p /tmp/deployhub-app-data',generate||'true',autoSqlite?'touch /tmp/deployhub-build.db':'true',initialize||'true',
    options.buildCommand||'true',options.runtimePrepareCommand||'true',
  ].join(' && ');
}

export function hostPath(directory:string,dataDirectory:string) {
  const relative=path.relative(dataDirectory,directory);
  if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('Runtime build path escapes artifact storage');
  return process.env.BUILD_HOST_DATA_DIR ? path.posix.join(process.env.BUILD_HOST_DATA_DIR,relative.replaceAll('\\','/')):directory;
}
