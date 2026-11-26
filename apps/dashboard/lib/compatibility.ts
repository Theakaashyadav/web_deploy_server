import type { UploadFile } from './upload';
export type DeploymentCapabilities = { staticUploadsAvailable: boolean; workerOnline: boolean; sourceBuildsAvailable: boolean; dynamicRuntimeAvailable: boolean; dockerAvailable: boolean; reason: string; actions: string[]; checkedAt: string | null; supportedRuntimeFrameworks: string[] };
export type UploadCompatibility = {kind:'static'|'source'|'runtime'|'unknown';framework?:string;summary:string};
const readText = async(file:File) => file.size<=1048576 ? file.text() : '';

/** Reads manifests as text only. The worker remains authoritative about framework support. */
export async function inspectUploadCompatibility(files:UploadFile[],archive=false):Promise<UploadCompatibility> {
  if(archive)return {kind:'unknown',summary:'ZIP contents and framework will be inspected securely by the worker after upload.'};
  const packages=files.filter(entry=>entry.path.split('/').at(-1)==='package.json').sort((a,b)=>a.path.split('/').length-b.path.split('/').length);
  for(const entry of packages.slice(0,50)) {
    let pkg:any;try{pkg=JSON.parse((await readText(entry.file)).replace(/^\uFEFF/,''));}catch{continue;}
    if(!pkg || typeof pkg!=='object' || Array.isArray(pkg) || pkg.workspaces)continue;
    const base=entry.path.slice(0,-'package.json'.length);
    const dependencies={...pkg?.dependencies,...pkg?.devDependencies};
    const output=files.some(candidate=>candidate.path.startsWith(base)&&/^(?:(?:dist|build|out|site)\/.*|\.output\/public\/)index\.html?$/i.test(candidate.path.slice(base.length)));
    if(output)return {kind:'static',summary:'A prebuilt website output was found. The worker will validate its files before publishing.'};
    const framework=dependencies.next?'Next.js':dependencies.nuxt?'Nuxt':dependencies.astro?'Astro':dependencies['@sveltejs/kit']?'SvelteKit':dependencies.vite?'Vite':dependencies['react-scripts']?'React':dependencies['@angular/core']?'Angular':dependencies.vue?'Vue':undefined;
    const source=!!framework || !!pkg?.scripts?.build || !!pkg?.scripts?.start || !!pkg?.scripts?.generate;
    if(!source)continue;
    let dynamic=!!dependencies.next || !!dependencies.nuxt || !!dependencies['@sveltejs/adapter-node'] || (!framework&&!!pkg?.scripts?.start);
    if(dependencies.next){
      const configuration=files.filter(candidate=>candidate.path.startsWith(base)&&/^next\.config\.(?:js|mjs|cjs|ts)$/.test(candidate.path.slice(base.length)));
      const contents=await Promise.all(configuration.map(candidate=>readText(candidate.file)));
      if(contents.some(value=>/output\s*:\s*['"]export['"]/.test(value)))dynamic=false;
    }
    if(dependencies.nuxt || dependencies.astro){
      const configuration=files.filter(candidate=>candidate.path.startsWith(base)&&/^(?:nuxt|astro)\.config\.(?:js|mjs|cjs|ts)$/.test(candidate.path.slice(base.length)));
      const contents=await Promise.all(configuration.map(candidate=>readText(candidate.file)));
      if(dependencies.nuxt && contents.some(value=>/ssr\s*:\s*false\b/.test(value)))dynamic=false;
      if(dependencies.astro && contents.some(value=>/output\s*:\s*['"](?:server|hybrid)['"]/.test(value)))dynamic=true;
    }
    return {kind:dynamic?'runtime':'source',framework:framework || 'Node.js',summary:`${framework || 'Node.js'} source detected. ${dynamic?'This website needs a server runtime as well as an isolated build.':'This website needs an isolated dependency install/build before publication.'}`};
  }
  return {kind:'static',summary:'Static files selected. Nested entry points and assets will be validated automatically.'};
}

export function compatibilityProblem(inspection:UploadCompatibility|null,capabilities:DeploymentCapabilities|null):string {
  if(!inspection||!capabilities)return '';
  if(inspection.kind==='runtime'&&!capabilities.dynamicRuntimeAvailable)return `${inspection.framework || 'This application'} needs a server runtime. ${capabilities.reason}`;
  if(inspection.kind==='source'&&!capabilities.sourceBuildsAvailable)return `${inspection.framework || 'This project'} needs a source build. ${capabilities.reason}`;
  return '';
}
