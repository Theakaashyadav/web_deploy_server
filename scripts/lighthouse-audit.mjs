import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {startBuiltSite,repository} from '../tests/helpers/site-server.mjs';
const cli=path.join(repository,'tests/artifacts/lighthouse-tool/node_modules/lighthouse/cli/index.js');
await fs.access(cli);
const site=await startBuiltSite();
const summaries=[];
try{
  for(const mode of ['mobile','desktop']){
    const reportPath=path.join(repository,`tests/artifacts/lighthouse-${mode}.json`);
    const args=[cli,site.origin,'--quiet','--chrome-flags=--headless=new --no-first-run','--only-categories=performance,accessibility,best-practices,seo','--output=json',`--output-path=${reportPath}`,...(mode==='desktop'?['--preset=desktop']:[])];
    await new Promise((resolve,reject)=>{
      const child=spawn(process.execPath,args,{cwd:repository,env:{...process.env,CHROME_PATH:process.env.E2E_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe'},stdio:['ignore','pipe','pipe'],windowsHide:true});
      let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);child.once('error',reject);child.once('close',code=>code===0?resolve():reject(new Error('Lighthouse '+mode+' exited '+code+': '+output.slice(-2500))));
    });
    const report=JSON.parse(await fs.readFile(reportPath,'utf8'));
    const summary={mode,lighthouseVersion:report.lighthouseVersion,userAgent:report.userAgent,environment:'Local production build; simulated Lighthouse lab throttling',scores:Object.fromEntries(Object.entries(report.categories).map(([name,value])=>[name,Math.round(value.score*100)])),metrics:{FCP:report.audits['first-contentful-paint'].numericValue,LCP:report.audits['largest-contentful-paint'].numericValue,CLS:report.audits['cumulative-layout-shift'].numericValue,TBT:report.audits['total-blocking-time'].numericValue,SpeedIndex:report.audits['speed-index'].numericValue},failedAudits:Object.entries(report.audits).filter(([,value])=>value.score!==null&&value.score<1&&['binary','numeric'].includes(value.scoreDisplayMode)).map(([id,value])=>({id,title:value.title,score:value.score,displayValue:value.displayValue,details:value.details})),warnings:report.runWarnings};
    summaries.push(summary);console.log(JSON.stringify({mode,scores:summary.scores,metrics:summary.metrics,warnings:summary.warnings}));
  }
  await fs.writeFile(path.join(repository,'docs/seo-lighthouse-results.json'),JSON.stringify(summaries,null,2)+'\n');
}finally{await site.stop();}
