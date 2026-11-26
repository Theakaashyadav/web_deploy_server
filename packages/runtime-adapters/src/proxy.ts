import http,{type IncomingHttpHeaders,type IncomingMessage,type ServerResponse} from 'node:http';
import type {Socket} from 'node:net';
import {validateRuntimeEndpoint} from './plan.js';

const hopHeaders=new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade']);
function cleanHeaders(headers:IncomingHttpHeaders,upgrade=false) {
  const connection=String(headers.connection||'').split(',').map(value=>value.trim().toLowerCase());
  const result:IncomingHttpHeaders={};
  for(const [name,value] of Object.entries(headers)){
    if(hopHeaders.has(name)||connection.includes(name)||name.startsWith('x-forwarded-')||name==='forwarded'||name==='x-deployhub-deployment')continue;
    result[name]=value;
  }
  if(result.cookie)result.cookie=result.cookie.split(';').filter(cookie=>!/^\s*(?:deployhub_session|__Host-deployhub_session)=/i.test(cookie)).join(';');
  if(upgrade){result.connection='Upgrade';result.upgrade=headers.upgrade;}
  return result;
}
function safeCookies(cookies:string[]|undefined,host:string){
  return cookies?.filter(cookie=>{
    if(/^\s*(?:deployhub_session|__Host-deployhub_session)=/i.test(cookie))return false;
    const domain=cookie.match(/;\s*domain=([^;]+)/i)?.[1].replace(/^\./,'').toLowerCase();
    return !domain||domain===host.split(':')[0].toLowerCase();
  });
}
export function proxyRuntime(request:IncomingMessage,response:ServerResponse,options:{endpoint:string;container?:string;deploymentId:string;protocol:string}) {
  const endpoint=validateRuntimeEndpoint(options.endpoint,options.container);
  const headers=cleanHeaders(request.headers);
  headers.host=request.headers.host;
  headers['x-forwarded-host']=request.headers.host||'';
  headers['x-forwarded-proto']=options.protocol==='https'?'https':'http';
  headers['x-forwarded-for']=request.socket.remoteAddress||'';
  const upstream=http.request({hostname:endpoint.hostname.replace(/^\[|\]$/g,''),port:endpoint.port,path:request.url||'/',method:request.method,headers,timeout:60000},incoming=>{
    const outgoing=cleanHeaders(incoming.headers);
    delete outgoing['cache-control'];
    outgoing['cache-control']='private, no-store';
    outgoing['x-deployhub-deployment']=options.deploymentId;
    outgoing['x-content-type-options']='nosniff';
    const cookies=safeCookies(incoming.headers['set-cookie'],request.headers.host||'');
    if(cookies?.length)outgoing['set-cookie']=cookies;else delete outgoing['set-cookie'];
    response.writeHead(incoming.statusCode||502,outgoing);incoming.pipe(response);
    incoming.on('error',()=>response.destroy());
  });
  upstream.on('timeout',()=>upstream.destroy(new Error('Runtime response timeout')));
  upstream.on('error',()=>{
    if(response.headersSent)return response.destroy();
    response.writeHead(503,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
    response.end('The application runtime is starting or unavailable. Inspect this deployment\'s runtime logs.');
  });
  request.on('aborted',()=>upstream.destroy());
  response.on('close',()=>{if(!response.writableEnded)upstream.destroy();});
  request.pipe(upstream);
}

export function proxyRuntimeUpgrade(request:IncomingMessage,socket:Socket,head:Buffer,options:{endpoint:string;container?:string;deploymentId:string;protocol:string}) {
  const endpoint=validateRuntimeEndpoint(options.endpoint,options.container);
  const headers=cleanHeaders(request.headers,true);
  headers.host=request.headers.host;headers['x-forwarded-host']=request.headers.host||'';headers['x-forwarded-proto']=options.protocol==='https'?'https':'http';headers['x-forwarded-for']=request.socket.remoteAddress||'';
  const upstream=http.request({hostname:endpoint.hostname.replace(/^\[|\]$/g,''),port:endpoint.port,path:request.url||'/',method:request.method,headers,timeout:60000});
  upstream.on('upgrade',(response,remote,remoteHead)=>{
    remote.setTimeout(0);socket.setTimeout(0);
    socket.write(`HTTP/1.1 ${response.statusCode||101} ${response.statusMessage||'Switching Protocols'}\r\n`);
    const responseHeaders=cleanHeaders(response.headers,true);delete responseHeaders['x-deployhub-deployment'];
    const cookies=safeCookies(response.headers['set-cookie'],request.headers.host||'');if(cookies?.length)responseHeaders['set-cookie']=cookies;else delete responseHeaders['set-cookie'];
    for(const [name,value] of Object.entries(responseHeaders)){
      if(value!==undefined)for(const item of Array.isArray(value)?value:[value])socket.write(`${name}: ${item}\r\n`);
    }
    socket.write(`X-DeployHub-Deployment: ${options.deploymentId}\r\n\r\n`);
    if(head.length)remote.write(head);if(remoteHead.length)socket.write(remoteHead);
    remote.pipe(socket);socket.pipe(remote);
    remote.on('error',()=>socket.destroy());socket.on('error',()=>remote.destroy());socket.on('close',()=>remote.destroy());
  });
  upstream.on('response',response=>{socket.end(`HTTP/1.1 ${response.statusCode||502} Runtime Unavailable\r\nConnection: close\r\n\r\n`);response.resume();});
  upstream.on('timeout',()=>upstream.destroy());upstream.on('error',()=>socket.destroy());socket.on('close',()=>upstream.destroy());upstream.end();
}
