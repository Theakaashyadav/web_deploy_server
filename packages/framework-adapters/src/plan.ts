import fs from 'node:fs/promises';
import path from 'node:path';
import type { Framework } from './index.js';

export type PackageManager = 'npm' | 'pnpm' | 'yarn';
export type DatabasePlan = { provider:string; environmentVariable?:string; schemaPath:string; hasMigrations:boolean; generateCommand:string; migrationCommand?:string };
export type FrameworkPlan = {
  framework:Framework; packageManager:PackageManager; packageManagerVersion?:string;
  installCommand:string; outputDirectory:string; buildCommand:string; dynamic:boolean;
  deploymentKind:'static'|'runtime'; startCommand:string; runtimePort:number;
  runtimePrepareCommand?:string; nodeVersionRange?:string; database?:DatabasePlan;
  requiredEnvironmentVariables:string[]; unsupportedReason?:string;
};
type ProjectPackage = { dependencies?:Record<string,string>; devDependencies?:Record<string,string>; scripts?:Record<string,string>; packageManager?:string; main?:string; engines?:{node?:string}; prisma?:{schema?:string} };
const quote=(value:string)=>"'"+value.replace(/'/g,"'\\''")+"'";

// Tokenize only enough configuration syntax to read literal settings. Do not evaluate uploads,
// and do not mistake commented examples or strings containing source text for configuration.
function configurationTokens(source:string) {
  const tokens:{kind:'word'|'string'|'symbol';value:string}[]=[];let index=0;
  while(index<source.length){
    const character=source[index];
    if(/\s/.test(character)){index++;continue;}
    if(character==='/'&&source[index+1]==='/'){index=source.indexOf('\n',index+2);if(index<0)break;continue;}
    if(character==='/'&&source[index+1]==='*'){const end=source.indexOf('*/',index+2);index=end<0?source.length:end+2;continue;}
    if(character==='"'||character==="'"||character==='`'){
      const delimiter=character;let value='';index++;
      while(index<source.length&&source[index]!==delimiter){if(source[index]==='\\'){index++;if(index<source.length)value+=source[index++];}else value+=source[index++];}
      index++;tokens.push({kind:'string',value});continue;
    }
    const word=source.slice(index).match(/^[a-zA-Z_$][\w$]*/)?.[0];
    if(word){tokens.push({kind:'word',value:word});index+=word.length;}else{tokens.push({kind:'symbol',value:character});index++;}
  }
  return tokens;
}
function literalSetting(source:string,name:string) {
  const tokens=configurationTokens(source);let value:string|undefined;
  for(let index=0;index<tokens.length-2;index++)if(tokens[index].value===name&&[':', '='].includes(tokens[index+1].value)&&tokens[index+2].kind==='string')value=tokens[index+2].value;
  return value;
}
function hasSetting(source:string,name:string) {const tokens=configurationTokens(source);return tokens.some((token,index)=>token.value===name&&tokens[index+1]?.value===':');}

async function readText(root:string,name:string) {
  const file=path.join(root,name),stat=await fs.lstat(file).catch(()=>null);
  if(!stat?.isFile()||stat.isSymbolicLink())return '';
  if(stat.size>1048576)throw new Error(`${name} exceeds the 1 MiB project configuration limit`);
  return fs.readFile(file,'utf8').then(value=>value.replace(/^\uFEFF/,''));
}
const exists=async(root:string,name:string)=>fs.lstat(path.join(root,name)).then(stat=>stat.isFile()&&!stat.isSymbolicLink(),()=>false);
const configurations=async(root:string,stem:string)=>(await Promise.all(['ts','mjs','js','cjs'].map(extension=>readText(root,`${stem}.${extension}`)))).join('\n');
function scriptCommand(manager:PackageManager,name:string) {const script=/^[a-z0-9:_-]+$/i.test(name)?name:quote(name);return manager==='npm'?`npm run ${script}`:`corepack ${manager} run ${script}`;}
function binaryCommand(manager:PackageManager,binary:string,args:string) {return manager==='npm'?`npm exec --no -- ${binary} ${args}`:`corepack ${manager} exec ${binary} ${args}`;}

async function packageManagerPlan(root:string,pkg:ProjectPackage) {
  const declared=pkg.packageManager?.match(/^(npm|pnpm|yarn)@(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?)(?:\+[^\s]+)?$/);
  const packageManager:PackageManager=declared?.[1] as PackageManager || (await exists(root,'pnpm-lock.yaml')?'pnpm':await exists(root,'yarn.lock')?'yarn':'npm');
  const packageManagerVersion=declared?.[2];let installCommand:string;
  if(packageManager==='pnpm')installCommand=`corepack pnpm install${await exists(root,'pnpm-lock.yaml')?' --frozen-lockfile':''}`;
  else if(packageManager==='yarn') {
    const lock=await readText(root,'yarn.lock');
    const modern=packageManagerVersion?Number(packageManagerVersion.split('.')[0])>=2:await exists(root,'.yarnrc.yml')||/^__metadata:/m.test(lock);
    installCommand=`corepack yarn install${lock?(modern?' --immutable':' --frozen-lockfile'):''}`;
  } else installCommand=(await exists(root,'package-lock.json')||await exists(root,'npm-shrinkwrap.json'))?'npm ci --no-audit --no-fund':'npm install --no-audit --no-fund';
  return {packageManager,packageManagerVersion,installCommand};
}

async function databasePlan(root:string,pkg:ProjectPackage,manager:PackageManager):Promise<DatabasePlan|undefined> {
  const candidates=pkg.prisma?.schema?[pkg.prisma.schema]:['prisma/schema.prisma','schema.prisma'];
  for(const name of candidates) {
    if(typeof name!=='string'||name.includes('\\')||name.includes('\0')||name.startsWith('/')||/^[a-z]:/i.test(name)||name.split('/').includes('..'))throw new Error('The Prisma schema path must remain inside the uploaded project');
    const source=await readText(root,name);if(!source)continue;
    const datasource=source.match(/\bdatasource\s+\w+\s*\{([\s\S]*?)\}/)?.[1];
    const provider=datasource?.match(/\bprovider\s*=\s*["']([^"']+)["']/)?.[1];if(!provider)continue;
    const environmentVariable=datasource?.match(/\burl\s*=\s*env\(\s*["']([A-Z_][A-Z0-9_]*)["']\s*\)/i)?.[1];
    const migrations=path.join(root,path.posix.dirname(name),'migrations'),entries=await fs.readdir(migrations,{withFileTypes:true}).catch(()=>[]);
    let hasMigrations=false;for(const entry of entries)if(entry.isDirectory()&&await exists(migrations,`${entry.name}/migration.sql`)){hasMigrations=true;break;}
    const schemaArgument=`--schema ${quote(name)}`,generateCommand=binaryCommand(manager,'prisma',`generate ${schemaArgument}`);
    const migrationCommand=hasMigrations?binaryCommand(manager,'prisma',`migrate deploy ${schemaArgument}`):provider==='sqlite'?binaryCommand(manager,'prisma',`db push --skip-generate ${schemaArgument}`):undefined;
    return {provider,environmentVariable,schemaPath:name,hasMigrations,generateCommand,migrationCommand};
  }
  return undefined;
}

/** Uploaded configuration is inspected as text and never executed on the management host. */
export async function detectFramework(root:string):Promise<FrameworkPlan> {
  let pkg:ProjectPackage={};const packageText=await readText(root,'package.json');
  if(packageText){try{pkg=JSON.parse(packageText);}catch{throw new Error('Invalid package.json');}if(!pkg||typeof pkg!=='object'||Array.isArray(pkg))throw new Error('Invalid package.json');}
  const deps={...pkg.dependencies,...pkg.devDependencies},manager=await packageManagerPlan(root,pkg);
  const plainServerEntry=(await Promise.all(['server.js','server.mjs','server.cjs','index.js','index.mjs','index.cjs','app.js'].map(name=>exists(root,name)))).some(Boolean);
  let framework:Framework='static',dynamic=false,outputDirectory='.',buildScript=pkg.scripts?.build?'build':'',startCommand='',runtimePrepareCommand:string|undefined,unsupportedReason:string|undefined;
  if(deps.next) {
    const cfg=await configurations(root,'next.config'),exported=literalSetting(cfg,'output')==='export'||/\bnext\s+export\b/.test(pkg.scripts?.build||'');
    const dist=literalSetting(cfg,'distDir')||'.next';
    if(dist.includes('\\')||dist.includes('\0')||dist.startsWith('/')||/^[a-z]:/i.test(dist)||dist.split('/').includes('..'))throw new Error('Next.js distDir must remain inside the uploaded project');
    framework=exported?'next-static':'next';dynamic=!exported;outputDirectory=exported?'out':dist;buildScript='build';
    if(dynamic){
      const custom=pkg.scripts?.start,regular='node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port 3000';
      const standalone=path.posix.join(dist,'standalone'),server=quote(path.posix.join(standalone,'server.js'));
      startCommand=custom&&!/^\s*next\s+start(?:\s+[^;&|]*)?\s*$/.test(custom)?scriptCommand(manager.packageManager,'start'):`if [ -f ${server} ]; then exec node ${server}; else exec ${regular}; fi`;
      runtimePrepareCommand=`if [ -f ${server} ]; then mkdir -p ${quote(path.posix.join(standalone,dist))}; if [ -d ${quote(path.posix.join(dist,'static'))} ]; then cp -R ${quote(path.posix.join(dist,'static'))} ${quote(path.posix.join(standalone,dist))}/; fi; if [ -d public ]; then cp -R public ${quote(standalone)}/; fi; fi`;
    }
  } else if(deps.nuxt) {
    framework='nuxt';const cfg=await configurations(root,'nuxt.config');
    const generated=/\b(?:nuxi|nuxt)\s+generate\b/.test(pkg.scripts?.build||'')||(!pkg.scripts?.build&&!!pkg.scripts?.generate)||['static','github_pages'].includes(literalSetting(cfg,'preset')||'');
    dynamic=!generated;outputDirectory=generated?'.output/public':'.output';buildScript=generated&&pkg.scripts?.generate?'generate':'build';if(dynamic)startCommand='node .output/server/index.mjs';
  } else if(deps.astro) {
    framework='astro';const cfg=await configurations(root,'astro.config');
    dynamic=['server','hybrid'].includes(literalSetting(cfg,'output')||'')||Boolean(deps['@astrojs/node']&&hasSetting(cfg,'adapter'));outputDirectory='dist';buildScript='build';
    if(dynamic){startCommand=pkg.scripts?.start?scriptCommand(manager.packageManager,'start'):'node dist/server/entry.mjs';if(!deps['@astrojs/node'])unsupportedReason='Astro server rendering requires the @astrojs/node standalone adapter. Static output or a supported Node adapter is required.';else if(literalSetting(cfg,'mode')==='middleware'&&!pkg.scripts?.start)unsupportedReason='Astro middleware output needs a custom Node start script, or configure the Node adapter in standalone mode.';}
  } else if(deps['@sveltejs/kit']) {
    framework='svelte';outputDirectory='build';buildScript='build';const cfg=await configurations(root,'svelte.config');
    const staticAdapter=/["']@sveltejs\/adapter-static["']/.test(cfg)||Boolean(deps['@sveltejs/adapter-static']&&!deps['@sveltejs/adapter-node']&&!deps['@sveltejs/adapter-auto']);dynamic=!staticAdapter;
    if(dynamic){startCommand=pkg.scripts?.start?scriptCommand(manager.packageManager,'start'):'node build';if(!deps['@sveltejs/adapter-node']&&!/["']@sveltejs\/adapter-node["']/.test(cfg))unsupportedReason='SvelteKit server rendering requires @sveltejs/adapter-node. adapter-auto and provider-specific adapters cannot run as a generic Node server.';}
  } else if(deps['@angular/core']) {
    framework='angular';outputDirectory='dist';buildScript='build';let angular:any;
    try{const source=await readText(root,'angular.json');angular=source?JSON.parse(source):undefined;}catch{throw new Error('Invalid angular.json');}
    const applications=Object.entries(angular?.projects||{}).filter(([,value])=>(value as any)?.projectType==='application');
    if(applications.length===1){const [name,application]=applications[0] as [string,any],options=(application.architect?.build||application.targets?.build)?.options||{},configured=options.outputPath,base=typeof configured==='string'?configured:configured?.base||`dist/${name}`;outputDirectory=base;if(options.outputMode==='server'||Boolean(options.ssr)&&options.outputMode!=='static'){dynamic=true;startCommand=`node ${quote(path.posix.join(base,'server/server.mjs'))}`;}}
  } else if(deps.vite){framework='vite';outputDirectory='dist';buildScript='build';}
  else if(deps['react-scripts']){framework='react';outputDirectory='build';buildScript='build';}
  else if(deps.vue){framework='vue';outputDirectory='dist';buildScript='build';}
  else if(deps.svelte){framework='svelte';outputDirectory='dist';buildScript='build';}
  else if(pkg.scripts?.start||Object.keys(deps).length||pkg.main||plainServerEntry) {
    framework='node';dynamic=true;outputDirectory='.';
    if(pkg.scripts?.start)startCommand=scriptCommand(manager.packageManager,'start');
    else{const candidates=[pkg.main,...['server.js','server.mjs','server.cjs','index.js','index.mjs','index.cjs','app.js']].filter((value):value is string=>typeof value==='string');let entry:string|undefined;for(const candidate of candidates){if(candidate.includes('\\')||candidate.startsWith('/')||candidate.split('/').includes('..')||!/\.(?:js|mjs|cjs)$/.test(candidate))continue;if(await exists(root,candidate)){entry=candidate;break;}}if(entry)startCommand=`node ${quote(entry)}`;else unsupportedReason='No production start script or JavaScript server entry was found. Add scripts.start to package.json or upload the built static output.';}
  }
  const database=await databasePlan(root,pkg,manager.packageManager),requiredEnvironmentVariables=database?.environmentVariable?[database.environmentVariable]:[];
  const buildCommand=buildScript?pkg.scripts?.[buildScript]?scriptCommand(manager.packageManager,buildScript):framework==='next'||framework==='next-static'?binaryCommand(manager.packageManager,'next','build'):framework==='nuxt'?binaryCommand(manager.packageManager,'nuxt',dynamic?'build':'generate'):scriptCommand(manager.packageManager,'build'):'';
  return {framework,...manager,installCommand:!packageText||framework==='static'&&!buildCommand?'':manager.installCommand,outputDirectory,buildCommand,dynamic,deploymentKind:dynamic?'runtime':'static',startCommand,runtimePort:3000,runtimePrepareCommand,nodeVersionRange:pkg.engines?.node,database,requiredEnvironmentVariables,unsupportedReason};
}
