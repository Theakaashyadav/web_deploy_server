import {ZipArchive} from 'archiver';
import {createWriteStream} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'exports','deployhub-vps.zip');
const directories=['apps','packages','infrastructure','scripts','docs','templates','tests','examples'];
const files=['package.json','package-lock.json','docker-compose.yml','README.md','AGENTS.md','tsconfig.base.json','.env.example','.dockerignore','.gitignore','.gitattributes','.npmrc'];
const excluded=new Set(['node_modules','.next','dist','.git','.npm-cache','data','exports','test-results','playwright-report','__pycache__']);
const selected=[];
async function walk(relative){
  for(const entry of await fs.readdir(path.join(root,relative),{withFileTypes:true})){
    if(excluded.has(entry.name)||entry.name.endsWith('.tsbuildinfo')||(relative==='tests'&&entry.name==='artifacts'))continue;
    if((/^\.env(?:$|\.)/i.test(entry.name)&&entry.name!=='.env.example')||/\.(?:db|sqlite|sqlite3)(?:-(?:wal|shm|journal))?$|\.(?:pem|key|p12|pfx)$|^id_(?:rsa|ed25519|ecdsa)$/i.test(entry.name))continue;
    const name=path.posix.join(relative,entry.name),source=path.join(root,name);
    const stat=await fs.lstat(source);if(stat.isSymbolicLink())throw new Error(`Unexpected source symlink: ${name}`);
    if(stat.isDirectory())await walk(name);else if(stat.isFile())selected.push(name);
  }
}
for(const directory of directories)await walk(directory);
selected.push(...files);
await fs.mkdir(path.dirname(output),{recursive:true});
await new Promise((resolve,reject)=>{
  const stream=createWriteStream(output,{mode:0o600}),archive=new ZipArchive({zlib:{level:9}});
  stream.on('close',resolve);stream.on('error',reject);archive.on('error',reject);archive.on('warning',reject);archive.pipe(stream);
  for(const name of selected.sort())archive.file(path.join(root,name),{name:`deployhub/${name}`});
  void archive.finalize().catch(reject);
});
console.log(`Created ${path.relative(root,output)} (${selected.length} source files). Local credentials, databases, uploaded websites and dependencies were excluded.`);
