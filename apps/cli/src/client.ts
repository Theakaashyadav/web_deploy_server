import { openAsBlob } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { packageDirectory } from './package.js';

export interface Project {
  id: string; name: string; slug: string; productionUrl?: string; status?: string;
  [key: string]: unknown;
}
export interface Deployment {
  id: string; status: string; environment: 'production' | 'preview';
  productionUrl?: string; previewUrl?: string; error?: string | null; project?: Project;
  [key: string]: unknown;
}
export interface DeploymentConfig {
  project?: string; framework?: string; rootDirectory?: string; buildCommand?: string;
  installCommand?: string; outputDirectory?: string; environment?: 'production' | 'preview'; autoDetect?: boolean;
}
export interface Log { id?: number | string; message: string; timestamp?: string; level?: string }

export async function readConfig(directory = process.cwd()): Promise<DeploymentConfig> {
  try {
    const config: unknown = JSON.parse(await readFile(path.join(directory, 'deployhub.json'), 'utf8'));
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('deployhub.json must contain an object.');
    return config as DeploymentConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

export class DeployHubClient {
  readonly baseUrl: string;
  constructor(baseUrl: string, readonly token: string, readonly signal?: AbortSignal) {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('DeployHub URL must be HTTP or HTTPS.');
    if (url.username || url.password) throw new Error('Do not embed credentials in DeployHub URLs.');
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw new Error('Remote DeployHub servers require HTTPS to protect your token.');
    }
    this.baseUrl = url.toString().replace(/\/$/, '').replace(/\/api\/v1$/, '');
  }
  async request<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
    if (!endpoint.startsWith('/') || endpoint.startsWith('//')) throw new Error('Invalid API endpoint.');
    const response = await fetch(`${this.baseUrl}/api/v1${endpoint}`, {
      ...init, signal: init.signal ?? this.signal,
      headers: { ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${this.token}`, ...init.headers },
      redirect: 'error',
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.error?.message ?? body?.error ?? body?.message ?? `DeployHub request failed (${response.status}).`);
    return body as T;
  }
  async findProject(reference: string): Promise<Project | undefined> {
    const { projects } = await this.request<{ projects: Project[] }>('/projects');
    return projects.find(project => project.id === reference || project.slug === reference || project.name === reference);
  }
  async ensureProject(reference: string, config: DeploymentConfig = {}): Promise<Project> {
    return await this.findProject(reference) ?? this.request<Project>('/projects', {
      method: 'POST', body: JSON.stringify({ name: reference, framework: config.framework ?? 'auto',
        buildCommand: config.buildCommand, installCommand: config.installCommand,
        rootDirectory: config.rootDirectory ?? '.', outputDirectory: config.outputDirectory }),
    });
  }
  async upload(projectId: string, archivePath: string, config: DeploymentConfig = {}, production = false): Promise<Deployment> {
    const body = new FormData();
    body.append('archive', await openAsBlob(archivePath, { type: 'application/zip' }), 'website.zip');
    body.append('environment', production ? 'production' : 'preview');
    if (production) body.append('authorizeProduction', 'true');
    for (const field of ['framework', 'rootDirectory', 'buildCommand', 'installCommand', 'outputDirectory'] as const) {
      if (config[field] !== undefined) body.append(field, String(config[field]));
    }
    return this.request<Deployment>(`/projects/${encodeURIComponent(projectId)}/deployments`, {
      method: 'POST', body, headers: { 'Idempotency-Key': randomUUID() },
    });
  }
  async wait(deploymentId: string, options: { timeoutMs?: number; onLog?: (log: Log) => void; onStatus?: (deployment: Deployment) => void } = {}): Promise<Deployment> {
    const until = Date.now() + (options.timeoutMs ?? 15 * 60 * 1000);
    let logCursor = 0;
    let fallbackSeen = 0;
    let lastStatus = '';
    while (Date.now() < until) {
      this.signal?.throwIfAborted();
      const deployment = await this.request<Deployment>(`/deployments/${encodeURIComponent(deploymentId)}`);
      if (options.onLog) {
        let more = true;
        while (more) {
          const { logs } = await this.request<{ logs: Log[] }>(`/deployments/${encodeURIComponent(deploymentId)}/logs?after=${logCursor}`);
          const hasCursors = logs.every(log => typeof log.id === 'number');
          for (const log of hasCursors ? logs : logs.slice(fallbackSeen)) options.onLog(log);
          if (hasCursors && logs.length) logCursor = logs.at(-1)!.id as number;
          fallbackSeen = logs.length;
          more = hasCursors && logs.length === 2000;
        }
      }
      if (deployment.status !== lastStatus) { options.onStatus?.(deployment); lastStatus = deployment.status; }
      if (deployment.status === 'live') {
        const url = deployment.environment === 'production' ? deployment.productionUrl : deployment.previewUrl;
        if (!url) throw new Error('Server reported live without a verified URL.');
        return deployment;
      }
      if (['failed', 'cancelled', 'archived'].includes(deployment.status)) {
        throw new Error(deployment.error || `Deployment ${deployment.status}.`);
      }
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => { clearTimeout(timer); reject(this.signal?.reason ?? new Error('Cancelled')); };
        const timer = setTimeout(() => { this.signal?.removeEventListener('abort', onAbort); resolve(); }, 750);
        this.signal?.addEventListener('abort', onAbort, { once: true });
      });
    }
    throw new Error(`Timed out waiting for deployment ${deploymentId}. Check status to resume monitoring.`);
  }
  async deployFolder(directory: string, options: {
    project: string; production?: boolean; config?: DeploymentConfig;
    onLog?: (log: Log) => void; onStatus?: (deployment: Deployment) => void;
  }): Promise<Deployment> {
    const config = options.config ?? await readConfig(directory);
    const project = await this.ensureProject(options.project, config);
    const archive = await packageDirectory(directory);
    try {
      const deployment = await this.upload(project.id, archive.path, config, options.production === true);
      return await this.wait(deployment.id, options);
    } finally { await archive.cleanup(); }
  }
}
