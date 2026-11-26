import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net,{type AddressInfo,type Socket} from 'node:net';
import {runtimeNames,runtimeContainerArguments,trustedRuntimeDockerfile,validateRuntimeEndpoint,runtimeStartupCommand,runtimeBuildCommand,projectRelative,type RuntimeBuildOptions} from '../packages/runtime-adapters/src/plan.js';
import {proxyRuntime,proxyRuntimeUpgrade} from '../packages/runtime-adapters/src/proxy.js';
import {buildAndStartRuntime} from '../packages/runtime-adapters/src/docker.js';

test('dynamic container plans enforce non-root isolation, private networking, limits and installation labels',()=>{
  const args=runtimeContainerArguments({id:'dpl-123456abcdef',projectId:'project123',environment:'production',image:'deployhub/dpl-123456abcdef:immutable',network:'deployhub-runtime',envFile:'/private/runtime.env',sqlite:true,gateway:'host',installationId:'instance123'});
  for(const expected of ['1000:1000','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--pids-limit','--memory','--cpus','--restart','unless-stopped','127.0.0.1::3000','io.deployhub.installation=instance123'])assert.ok(args.includes(expected),expected);
  assert.ok(!args.includes('--privileged'));assert.ok(!args.some(value=>value.includes('docker.sock')));
  assert.ok(args.some(value=>value.includes('deployhub-data-project-project123')));
  const network=runtimeContainerArguments({id:'dpl-123456abcdef',projectId:'project123',environment:'preview',image:'image',network:'deployhub-runtime',envFile:'/private/runtime.env',sqlite:false,gateway:'network'});
  assert.ok(!network.includes('--publish'));assert.notEqual(runtimeNames('dpl-123456abcdef','project123','preview').volume,runtimeNames('dpl-123456abcdef','project123','production').volume);
  assert.ok(network.includes('type=volume,src=deployhub-data-preview-dpl-123456abcdef,dst=/app-data'),'Generic Node runtimes need persistent private writable storage as well as SQLite applications.');
});
test('runtime image recipe never executes uploaded Dockerfiles and paths cannot escape',()=>{
  const recipe=trustedRuntimeDockerfile('node:22-bookworm','outer/application','npm start');
  assert.match(recipe,/COPY --chown=1000:1000 app\/ \/app\//);assert.match(recipe,/USER 1000:1000/);assert.ok(!/^RUN /m.test(recipe));assert.match(recipe,/WORKDIR "\/app\/outer\/application"/);
  for(const value of ['../other','/etc','a\\b','C:/private'])assert.throws(()=>projectRelative(value),/Unsafe/);
  assert.throws(()=>runtimeNames('other-container','project123','preview'),/Invalid/);
  assert.throws(()=>trustedRuntimeDockerfile('node:22\nRUN malicious','.','npm start'),/Invalid/);
});
test('runtime endpoint validation prevents arbitrary network targets',()=>{
  assert.equal(validateRuntimeEndpoint('http://127.0.0.1:4567').port,'4567');
  assert.equal(validateRuntimeEndpoint('http://deployhub-runtime-dpl-123456abcdef:3000').port,'3000');
  for(const endpoint of ['http://169.254.169.254:80','http://postgres:5432','https://example.com:443','http://user:password@127.0.0.1:1234','http://127.0.0.1:1234/path','http://deployhub-runtime-dpl-123456abcdef:3000?path=private'])assert.throws(()=>validateRuntimeEndpoint(endpoint));
});
test('SQLite bootstrap applies only to a fresh isolated data volume',()=>{
  const options={id:'dpl-123456abcdef',projectId:'project123',environment:'production',appUrl:'https://site.example.test',sourceDirectory:'/source',framework:'next',installCommand:'npm ci',buildCommand:'npm run build',startCommand:'npm start',variables:{},database:{provider:'sqlite',hasMigrations:true,migrationCommand:'npm exec --no -- prisma migrate deploy'},onLog:()=>{}} satisfies RuntimeBuildOptions;
  const command=runtimeStartupCommand(options,true);
  assert.match(command,/if \[ ! -f \/app-data\/.deployhub-initialized \]/);assert.match(command,/prisma migrate deploy/);assert.match(command,/touch \/app-data\/.deployhub-initialized/);
  assert.equal(runtimeStartupCommand(options,false),'npm start');
});
test('runtime dependency installation precedes production-mode generation and application builds',()=>{
  const command=runtimeBuildCommand({id:'dpl-123456abcdef',projectId:'project123',environment:'preview',appUrl:'http://site.localhost:4101',sourceDirectory:'/source',projectRootRelative:'outer/application',framework:'next',installCommand:'npm ci',buildCommand:'npm run build',runtimePrepareCommand:'node prepare.mjs',startCommand:'npm start',variables:{},database:{provider:'sqlite',hasMigrations:false,generateCommand:'npm exec --no -- prisma generate',migrationCommand:'npm exec --no -- prisma db push --skip-generate'},onLog:()=>{}},true);
  assert.ok(command.indexOf('npm ci')<command.indexOf('export NODE_ENV=production'));
  for(const after of ['prisma generate','prisma db push','npm run build','node prepare.mjs'])assert.ok(command.indexOf(after)>command.indexOf('export NODE_ENV=production'),after);
  assert.match(command,/cd '\/app\/outer\/application'/);
});
test('dynamic source never falls back to unisolated host execution',async()=>{
  const enabled=process.env.BUILD_DOCKER_ENABLED;process.env.BUILD_DOCKER_ENABLED='false';
  try{await assert.rejects(buildAndStartRuntime({id:'dpl-123456abcdef',projectId:'project123',environment:'preview',appUrl:'http://site.localhost:4101',sourceDirectory:'/source',framework:'next',installCommand:'npm ci',buildCommand:'npm run build',startCommand:'npm start',variables:{},onLog:()=>{}}),/Linux Docker engine|isolated worker/);}
  finally{if(enabled===undefined)delete process.env.BUILD_DOCKER_ENABLED;else process.env.BUILD_DOCKER_ENABLED=enabled;}
});

test('dynamic proxy forwards POST bodies and app routes, strips forged forwarding/admin cookies and preserves private responses',async()=>{
  let received: {headers:http.IncomingHttpHeaders;body:string;url:string|undefined}|undefined;
  const application=http.createServer((request,response)=>{
    let body='';request.on('data',chunk=>body+=chunk);request.on('end',()=>{
      received={headers:request.headers,body,url:request.url};
      response.setHeader('Cache-Control','public,max-age=9999');response.setHeader('X-DeployHub-Deployment','forged');
      response.setHeader('Set-Cookie',['app_session=ok; Path=/; HttpOnly','deployhub_session=forged; Path=/','other=bad; Domain=localhost; Path=/']);
      response.end(JSON.stringify({ok:true}));
    });
  });
  await new Promise<void>(resolve=>application.listen(0,'127.0.0.1',resolve));
  const endpoint=`http://127.0.0.1:${(application.address() as AddressInfo).port}`;
  const gateway=http.createServer((request,response)=>proxyRuntime(request,response,{endpoint,deploymentId:'dpl-123456abcdef',protocol:'https'}));
  await new Promise<void>(resolve=>gateway.listen(0,'127.0.0.1',resolve));
  try{
    const result=await new Promise<{status:number;headers:http.IncomingHttpHeaders;body:string}>((resolve,reject)=>{
      const request=http.request({hostname:'127.0.0.1',port:(gateway.address() as AddressInfo).port,path:'/api/contact?x=1',method:'POST',headers:{Host:'site.sites.example.test',Cookie:'app=keep; deployhub_session=do-not-forward','X-Forwarded-For':'forged','X-Forwarded-Proto':'http','Content-Type':'application/json'}},response=>{
        let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve({status:response.statusCode!,headers:response.headers,body}));
      });request.on('error',reject);request.end('{"message":"hello"}');
    });
    assert.equal(result.status,200);assert.equal(received?.body,'{"message":"hello"}');assert.equal(received?.url,'/api/contact?x=1');
    assert.equal(received?.headers.host,'site.sites.example.test');assert.equal(received?.headers['x-forwarded-proto'],'https');assert.notEqual(received?.headers['x-forwarded-for'],'forged');
    assert.equal(received?.headers.cookie,'app=keep');assert.equal(result.headers['x-deployhub-deployment'],'dpl-123456abcdef');assert.equal(result.headers['cache-control'],'private, no-store');
    assert.deepEqual(result.headers['set-cookie'],['app_session=ok; Path=/; HttpOnly']);
  }finally{await new Promise<void>(resolve=>gateway.close(()=>resolve()));await new Promise<void>(resolve=>application.close(()=>resolve()));}
});

test('dynamic gateway tunnels application upgrades without exposing a management cookie',async()=>{
  const sockets=new Set<Socket>();let cookie='';
  const application=http.createServer();
  application.on('upgrade',(request,socket,head)=>{
    const connection=socket as Socket;sockets.add(connection);connection.on('error',()=>{});cookie=request.headers.cookie||'';
    connection.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
    if(head.length)connection.write(head);connection.on('data',chunk=>connection.write(chunk));
  });
  await new Promise<void>(resolve=>application.listen(0,'127.0.0.1',resolve));
  const gateway=http.createServer();
  gateway.on('upgrade',(request,socket,head)=>{sockets.add(socket as Socket);proxyRuntimeUpgrade(request,socket as Socket,head,{endpoint:`http://127.0.0.1:${(application.address() as AddressInfo).port}`,deploymentId:'dpl-123456abcdef',protocol:'https'});});
  await new Promise<void>(resolve=>gateway.listen(0,'127.0.0.1',resolve));
  try{
    await new Promise<void>((resolve,reject)=>{
      const client=net.connect((gateway.address() as AddressInfo).port,'127.0.0.1');sockets.add(client);
      const timeout=setTimeout(()=>{client.destroy();reject(new Error('Upgrade tunnel timeout'));},3000);let data='',upgraded=false;
      client.on('error',reject);client.on('connect',()=>client.write('GET /socket HTTP/1.1\r\nHost: site.sites.example.test\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nCookie: app=keep; deployhub_session=private\r\n\r\n'));
      client.on('data',chunk=>{
        data+=chunk.toString();
        if(!upgraded&&data.includes('\r\n\r\n')){assert.match(data,/101 Switching Protocols/);assert.match(data,/X-DeployHub-Deployment: dpl-123456abcdef/i);upgraded=true;data=data.split('\r\n\r\n').slice(1).join('\r\n\r\n');client.write('echo-payload');}
        if(upgraded&&data.includes('echo-payload')){clearTimeout(timeout);client.destroy();resolve();}
      });
    });
    assert.equal(cookie,'app=keep');
  }finally{for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>gateway.close(()=>resolve()));await new Promise<void>(resolve=>application.close(()=>resolve()));}
});
