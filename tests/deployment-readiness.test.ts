import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deploymentReadiness} from '../apps/api/src/readiness.js';
import {inspectUploadCompatibility,compatibilityProblem} from '../apps/dashboard/lib/compatibility.js';
import {runtimeActivationProblem} from '../apps/api/src/deployment-policy.js';

test('readiness requires fresh worker confirmation rather than configuration claims',()=>{
  const now=Date.now();
  for(const report of [null,'bad JSON',JSON.stringify({checkedAt:new Date(now-60000).toISOString(),dockerAvailable:true,sourceBuildsAvailable:true,dynamicRuntimeAvailable:true})]) {
    const result=deploymentReadiness(report,now);assert.equal(result.sourceBuildsAvailable,false);assert.equal(result.dynamicRuntimeAvailable,false);assert.equal(result.staticUploadsAvailable,true);
  }
  const ready=deploymentReadiness(JSON.stringify({checkedAt:new Date(now).toISOString(),dockerAvailable:true,sourceBuildsAvailable:true,dynamicRuntimeAvailable:true,supportedRuntimeFrameworks:['next','node']}),now);
  assert.equal(ready.dynamicRuntimeAvailable,true);assert.deepEqual(ready.supportedRuntimeFrameworks,['next','node']);
  const disabled=deploymentReadiness(JSON.stringify({checkedAt:new Date(now).toISOString(),dockerAvailable:true,sourceBuildsAvailable:false,dynamicRuntimeAvailable:true}),now);assert.equal(disabled.dynamicRuntimeAvailable,false);
});

test('folder preflight distinguishes Next source, static exports and ready output without executing configuration',async()=>{
  const file=(path:string,value:string)=>({path,file:new File([value],path.split('/').at(-1)!)});
  const next=file('wrapper/site/package.json',JSON.stringify({dependencies:{next:'16'}}));
  assert.equal((await inspectUploadCompatibility([next])).kind,'runtime');
  assert.equal((await inspectUploadCompatibility([next,file('wrapper/site/next.config.ts',"export default {output:'export'}")])).kind,'source');
  assert.equal((await inspectUploadCompatibility([next,file('wrapper/site/out/index.html','<h1>Ready</h1>')])).kind,'static');
  assert.equal((await inspectUploadCompatibility([file('site/index.html','<h1>Static</h1>')])).kind,'static');
  assert.equal((await inspectUploadCompatibility([],true)).kind,'unknown');
  const unavailable=deploymentReadiness(null);
  assert.match(compatibilityProblem(await inspectUploadCompatibility([next]),unavailable),/server runtime/);
  assert.equal(compatibilityProblem({kind:'static',summary:'Ready'},unavailable),'');
});

test('runtime promotion cannot carry preview storage or secrets into production',()=>{
  assert.match(runtimeActivationProblem({environment:'preview',artifact:{kind:'runtime'}}) || '',/preview settings and storage/);
  assert.match(runtimeActivationProblem({environment:'preview',artifact:{kind:'runtime'}}) || '',/authorizeProduction:true/);
  assert.equal(runtimeActivationProblem({environment:'production',artifact:{kind:'runtime'}}),null);
  assert.equal(runtimeActivationProblem({environment:'preview',artifact:{kind:'static'}}),null);
});
