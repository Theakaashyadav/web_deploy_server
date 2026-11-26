export type UploadFile = { file: File; path: string };
export type UploadLimits = { maxUploadBytes: number; maxFiles: number };
const localDirectories = new Set(['node_modules', '.git', '.svn', '.hg', '.ssh', '.aws', '.azure', '.gcloud', '.config', '.kube', '.docker', '.terraform', '.codex', '.vercel', '.netlify', '.cache', '.npm-cache', '.pnpm-store', '.parcel-cache', '.turbo', '.local', '.tmp', '.next', '.nuxt', '.deployhub', '.npm', 'backups', 'coverage', '__macosx']);
const localFiles = /^(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|credentials(?:\..*)?|auth\.json|secrets?\.(?:json|yaml|yml|toml)|service[-_]?account.*\.json|id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?|.*\.(?:pem|key|p12|pfx|keystore|jks|tmp|temp|swp|swo)|\.DS_Store|Thumbs\.db)$/i;

export function excludedUploadPath(value: string): boolean {
  return value.replaceAll('\\', '/').split('/').some(part => localDirectories.has(part.toLowerCase()) || localFiles.test(part));
}

export function prepareUploadFiles(files: Iterable<File | UploadFile>): { files: UploadFile[]; skipped: number } {
  const selected: UploadFile[] = [], seen = new Set<string>();
  let skipped = 0;
  for (const entry of files) {
    const file = 'file' in entry ? entry.file : entry;
    const relative = 'file' in entry ? entry.path : file.webkitRelativePath || file.name;
    if (excludedUploadPath(relative)) { skipped++; continue; }
    if (!relative || relative.startsWith('/') || relative.includes('\\') || relative.includes('\0') || /^[a-z]:/i.test(relative) || relative.split('/').some(part => !part || part === '.' || part === '..')) {
      throw new Error('A selected file has an unsafe relative path. Select the website folder again.');
    }
    if (relative.length > 1024) throw new Error('A file path is too long. Move the website closer to the selected folder or upload a ZIP with shorter paths.');
    const identity = relative.toLowerCase();
    if (seen.has(identity)) throw new Error(`Two selected files have the same path: ${relative}. Choose their containing folder to preserve their separate directories.`);
    seen.add(identity); selected.push({file,path:relative});
  }
  return {files:selected,skipped};
}

export function uploadSelectionProblem(files: UploadFile[], limits: UploadLimits | null): string {
  if (!limits || !files.length) return '';
  if (files.length > limits.maxFiles) return `This selection contains ${files.length.toLocaleString()} files; the server allows ${limits.maxFiles.toLocaleString()} per upload. Choose the prebuilt website output or upload a ZIP within the extraction limits.`;
  const bytes = files.reduce((sum,entry)=>sum+entry.file.size,0);
  if (bytes > limits.maxUploadBytes) return `This selection exceeds the server's ${(limits.maxUploadBytes / 1048576).toLocaleString()} MiB upload limit. Choose a smaller website output, use a ZIP, or increase MAX_UPLOAD_BYTES on your server.`;
  return '';
}

/** Read every directory page; browsers commonly return at most 100 entries per call. */
export async function readDroppedFiles(items: DataTransferItemList, fallback: FileList): Promise<{ files: UploadFile[]; skipped: number }> {
  const roots = Array.from(items).filter(item=>item.kind === 'file').map(item=>item.webkitGetAsEntry?.()).filter((entry): entry is FileSystemEntry=>!!entry);
  if (!roots.length) return prepareUploadFiles(Array.from(fallback));
  const files: UploadFile[] = [];
  let skipped = 0, scanned = 0;
  async function visit(entry: FileSystemEntry, parent: string, depth: number): Promise<void> {
    const relative = parent ? `${parent}/${entry.name}` : entry.name;
    if (excludedUploadPath(relative)) { skipped++; return; }
    if (depth > 64 || ++scanned > 50000) throw new Error('This folder is too large or too deeply nested to read in the browser. Upload a ZIP of the website or its prebuilt output instead.');
    if (entry.isFile) {
      const file = await new Promise<File>((resolve,reject)=>(entry as FileSystemFileEntry).file(resolve,reject));
      files.push({file,path:relative});
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      while (true) {
        const entries = await new Promise<FileSystemEntry[]>((resolve,reject)=>reader.readEntries(resolve,reject));
        if (!entries.length) break;
        for (const child of entries) await visit(child,relative,depth+1);
      }
    }
  }
  for (const root of roots) await visit(root,'',0);
  const prepared = prepareUploadFiles(files);
  return {files:prepared.files,skipped:skipped+prepared.skipped};
}

export function uploadResponseError(status: number, responseText: string): string {
  let message = '';
  try {
    const data = JSON.parse(responseText);
    const error = typeof data.error === 'string' ? data.error : data.error?.message || data.message;
    if (typeof error === 'string') message = error;
    if (Array.isArray(data.details)) {
      const details = data.details.slice(0,5).map((item: {path?:string;message?:string})=>[item.path,item.message].filter(Boolean).join(': ')).filter(Boolean).join('; ');
      if (details) message += `${message ? '. ' : ''}${details}`;
    }
  } catch { /* Proxy error pages may contain HTML; never display their source. */ }
  if (message) return message;
  if (status === 413) return 'The upload exceeds the server size or file-count limit. Dependency and cache folders are excluded automatically; choose the prebuilt website output or increase the server upload limit.';
  if (status === 401) return 'Your session has expired. Sign in again, then retry this upload.';
  if (status === 403) return 'The server refused this upload. Check your project permissions and use the configured DeployHub dashboard address.';
  if ([408,504].includes(status)) return 'The upload timed out before it reached the deployment queue. Your selected files are ready to retry; use a ZIP for a large folder.';
  if (status >= 500) return `The upload service could not accept the request (HTTP ${status}). Your selected files are preserved. Retry the upload; if it continues, check the API and dashboard logs.`;
  if (status === 0) return 'The upload connection failed. Your selected files are ready to retry.';
  return `Upload failed (HTTP ${status}). Your selected files are ready to retry.`;
}
