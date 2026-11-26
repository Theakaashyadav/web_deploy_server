import type { Request, RequestHandler } from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { safePath } from '../../../packages/storage/src/safe-files.js';

export class UploadError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const uploadManifestLimit = 8 * 1024 * 1024;
export const uploadOverheadLimit = 32 * 1024 * 1024;

export function multipartError(error: unknown): Error {
  if (error instanceof UploadError) return error;
  if (error instanceof multer.MulterError) {
    const messages: Record<string,string> = {
      LIMIT_FILE_SIZE: 'A file exceeds the configured upload size limit.',
      LIMIT_FILE_COUNT: 'This folder contains too many files. Exclude dependencies and cache folders, or upload a smaller website.',
      LIMIT_FIELD_VALUE: 'Upload metadata exceeds its size limit. Use a ZIP for a folder with very long file paths.',
      LIMIT_UNEXPECTED_FILE: 'Unexpected upload field. Send one ZIP as archive, or website files as files.',
    };
    return new UploadError(error.code === 'LIMIT_UNEXPECTED_FILE' ? 400 : 413, messages[error.code] || error.message);
  }
  const message = (error as Error)?.message || '';
  if (/aborted|unexpected end|malformed|boundary|multipart/i.test(message)) {
    return new UploadError(400, 'The upload was interrupted or incomplete. Retry the upload; no website version was published.');
  }
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === 'ENOSPC' || code === 'EDQUOT') return new UploadError(507, 'The server has insufficient upload storage. Free space and retry.');
  return error instanceof Error ? error : new Error('Upload failed');
}

export function validateUploadPaths(root: string, value: unknown, fileCount: number): string[] {
  if (typeof value !== 'string') throw new UploadError(400, 'Provide one paths JSON array matching the uploaded files.');
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new UploadError(400, 'The uploaded file paths are not valid JSON.'); }
  if (!Array.isArray(parsed) || parsed.length !== fileCount || parsed.some(name => typeof name !== 'string' || !name || name.length > 1024)) {
    throw new UploadError(400, 'Provide paths JSON matching every uploaded file, with paths up to 1024 characters.');
  }
  const files = new Set<string>(), directories = new Set<string>();
  for (const relative of parsed as string[]) {
    try { safePath(root, relative); } catch { throw new UploadError(400, `Unsafe upload path: ${relative.slice(0,120)}`); }
    const parts = relative.split('/');
    if (parts.some(part => !part || part === '.' || /[:\x00-\x1f]/.test(part) || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
      throw new UploadError(400, `Unsupported upload file name: ${relative.slice(0,120)}`);
    }
    const key = parts.join('/').toLowerCase();
    if (files.has(key)) throw new UploadError(400, `Duplicate upload path: ${relative.slice(0,120)}`);
    if (directories.has(key)) throw new UploadError(400, `A file and folder share the same upload path: ${relative.slice(0,120)}`);
    for (let depth=1;depth<parts.length;depth++) {
      const parent = parts.slice(0,depth).join('/').toLowerCase();
      if (files.has(parent)) throw new UploadError(400, `A file and folder share the same upload path: ${relative.slice(0,120)}`);
      directories.add(parent);
    }
    files.add(key);
  }
  return parsed as string[];
}

export function createMultipartUpload(options: { directory: string; maxBytes: number; maxFiles: number }): RequestHandler {
  type State = { directory: Promise<string>; bytes: number; aborted: boolean; streams: Set<NodeJS.ReadableStream>; pending: Set<Promise<unknown>> };
  const states = new WeakMap<Request, State>();
  const storage: multer.StorageEngine = {
    _handleFile(request,file,callback) {
      const state=states.get(request)!;
      state.streams.add(file.stream);
      const operation=(async()=>{
        const directory=await state.directory;
        if(state.aborted)throw new UploadError(400,'Upload cancelled.');
        const filename=randomBytes(16).toString('hex'), target=path.join(directory,filename);
        let size=0;
        const counter=new Transform({transform(chunk,_encoding,done){
          size+=chunk.length;state.bytes+=chunk.length;
          done(state.bytes>options.maxBytes ? new UploadError(413,`The folder exceeds the configured ${options.maxBytes} byte upload limit. Exclude dependencies and caches, or upload the built website.`) : null,chunk);
        }});
        try { await pipeline(file.stream,counter,createWriteStream(target,{flags:'wx',mode:0o600})); }
        catch(error) { await fs.rm(target,{force:true}).catch(()=>{});throw error; }
        return {destination:directory,filename,path:target,size};
      })();
      state.pending.add(operation);
      operation.then(info=>callback(null,info),error=>callback(error)).finally(()=>{state.pending.delete(operation);state.streams.delete(file.stream);});
    },
    _removeFile(_request,file,callback) { fs.rm(file.path,{force:true}).then(()=>callback(null),callback); },
  };
  const parse=multer({storage,preservePath:true,limits:{fileSize:options.maxBytes,files:options.maxFiles,fields:30,fieldSize:uploadManifestLimit,fieldNameSize:100,parts:options.maxFiles+31}})
    .fields([{name:'archive',maxCount:1},{name:'file',maxCount:1},{name:'files',maxCount:options.maxFiles}]);
  return (request,response,next)=>{
    const state: State={directory:fs.mkdir(options.directory,{recursive:true}).then(()=>fs.mkdtemp(path.join(options.directory,'.incoming-'))),bytes:0,aborted:false,streams:new Set(),pending:new Set()};
    states.set(request,state);
    let cleaned: Promise<void>|undefined;
    const cleanup=()=>cleaned ||= (async()=>{
      await Promise.allSettled([...state.pending]);
      const directory=await state.directory.catch(()=>undefined);
      if(directory)await fs.rm(directory,{recursive:true,force:true}).catch(()=>{});
    })();
    const aborted=()=>{
      state.aborted=true;
      for(const stream of state.streams)(stream as NodeJS.ReadableStream & {destroy(error?:Error):void}).destroy(new UploadError(400,'Upload cancelled.'));
      void cleanup();
    };
    request.once('aborted',aborted);
    response.once('finish',()=>{request.off('aborted',aborted);void cleanup();});
    const contentLength=Number(request.headers['content-length']);
    if(Number.isFinite(contentLength)&&contentLength>options.maxBytes+uploadOverheadLimit) {
      void cleanup().then(()=>next(new UploadError(413,'The request exceeds the configured website upload size limit.')));return;
    }
    parse(request,response,error=>{
      if(error)void cleanup().then(()=>next(multipartError(error)));
      else next();
    });
  };
}
