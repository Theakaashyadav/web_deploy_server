import { createApp } from './app.js';
import { db } from '../../../packages/database/src/index.js';
import { config } from '../../../packages/shared/src/config.js';

async function main(){
  await db.$connect();
  const app=await createApp();
  const server=app.listen(config.apiPort,'0.0.0.0',()=>console.log(`DeployHub API listening on :${config.apiPort}`));
  // Keep upstream connections alive beyond the dashboard's pooling window and allow large uploads.
  server.keepAliveTimeout=65000;
  server.headersTimeout=70000;
  server.requestTimeout=600000;
  const quit=()=>server.close(()=>{void db.$disconnect().then(()=>process.exit(0));});
  process.on('SIGTERM',quit);process.on('SIGINT',quit);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
