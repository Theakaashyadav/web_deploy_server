#!/usr/bin/env node
import { Command } from 'commander';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { spawn } from 'node:child_process';
import { DeployHubClient, readConfig, type Deployment, type Project } from './client.js';

const abort = new AbortController();
process.once('SIGINT', () => abort.abort(new Error('Operation cancelled. A queued deployment may continue; use the dashboard to cancel it.')));
const configDirectory = process.env.DEPLOYHUB_CONFIG_DIR ?? path.join(homedir(), '.deployhub');
const credentialsPath = path.join(configDirectory, 'credentials.json');
const program = new Command().name('deployhub').description('Deploy websites through your self-hosted DeployHub server.')
  .version('0.1.0').option('--url <url>', 'DeployHub management API URL', process.env.DEPLOYHUB_URL)
  .option('--json', 'Write machine-readable JSON only');

function isJson(): boolean { return Boolean(program.opts().json); }
function print(value: unknown): void {
  if (isJson() || typeof value !== 'string') process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  else process.stdout.write(`${value}\n`);
}
async function credentials(): Promise<{ url?: string; token?: string }> {
  try { return JSON.parse(await readFile(credentialsPath, 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; return {}; }
}
async function client(): Promise<DeployHubClient> {
  const saved = await credentials();
  const token = process.env.DEPLOYHUB_TOKEN ?? saved.token;
  if (!token) throw new Error('Set DEPLOYHUB_TOKEN or run deployhub login with a scoped API key.');
  return new DeployHubClient(program.opts().url ?? saved.url ?? 'http://localhost:4100', token, abort.signal);
}
async function secret(question: string): Promise<string> {
  if (!process.stdin.isTTY) throw new Error('Set DEPLOYHUB_TOKEN when stdin is not an interactive terminal.');
  let muted = false;
  const output = new Writable({ write(chunk, _encoding, done) { if (!muted) process.stderr.write(chunk); done(); } });
  const reader = createInterface({ input: process.stdin, output, terminal: true });
  try {
    const answer = reader.question(question);
    muted = true;
    return (await answer).trim();
  } finally { reader.close(); process.stderr.write('\n'); }
}
async function resolveProject(api: DeployHubClient, reference?: string): Promise<Project> {
  const config = await readConfig();
  const name = reference ?? config.project;
  if (!name) throw new Error('Pass --project or configure project in deployhub.json.');
  const project = await api.findProject(name);
  if (!project) throw new Error(`Project not found: ${name}`);
  return project;
}
async function resolveDeployment(api: DeployHubClient, id?: string, projectReference?: string): Promise<Deployment> {
  if (id) return api.request<Deployment>(`/deployments/${encodeURIComponent(id)}`);
  const project = await resolveProject(api, projectReference);
  const { deployments } = await api.request<{ deployments: Deployment[] }>('/deployments');
  const deployment = deployments.find(item => item.project?.id === project.id || item.projectId === project.id);
  if (!deployment) throw new Error('This project has no deployments.');
  return deployment;
}
const progress = {
  onLog(log: { message: string }) { if (!isJson()) process.stderr.write(`${log.message}\n`); },
  onStatus(deployment: Deployment) { if (!isJson()) process.stderr.write(`[${deployment.status}] ${deployment.id}\n`); },
};

program.command('login').description('Save and validate a scoped API key. Prefer DEPLOYHUB_TOKEN in automation.')
  .action(async () => {
    const saved = await credentials();
    const url = program.opts().url ?? saved.url ?? 'http://localhost:4100';
    const token = process.env.DEPLOYHUB_TOKEN ?? await secret('DeployHub API key (hidden): ');
    const api = new DeployHubClient(url, token, abort.signal);
    await api.request('/auth/me');
    await mkdir(configDirectory, { recursive: true, mode: 0o700 });
    await writeFile(credentialsPath, JSON.stringify({ url: api.baseUrl, token }), { mode: 0o600 });
    if (process.platform !== 'win32') await chmod(credentialsPath, 0o600);
    print({ success: true, url: api.baseUrl });
  });

program.command('logout').description('Remove this machine’s saved API key (does not revoke it on the server).')
  .action(async () => { await rm(credentialsPath, { force: true }); print({ success: true }); });

program.command('init').description('Create deployhub.json in the current directory.')
  .option('--project <name>', 'Project name', path.basename(process.cwd()))
  .action(async options => {
    const config = { project: options.project, framework: 'auto', rootDirectory: '.', environment: 'preview', autoDetect: true };
    await writeFile(path.join(process.cwd(), 'deployhub.json'), `${JSON.stringify(config, null, 2)}\n`, { flag: 'wx' });
    print({ success: true, config });
  });

program.command('deploy').description('Package and deploy a website; preview is the default.')
  .option('--prod', 'Explicitly authorize a production deployment')
  .option('--preview', 'Create an immutable preview deployment')
  .option('--project <name>', 'Project ID, name, or slug')
  .option('--dir <directory>', 'Directory to package', '.')
  .action(async options => {
    if (options.prod && options.preview) throw new Error('Choose either --prod or --preview.');
    const directory = path.resolve(options.dir);
    const config = await readConfig(directory);
    const reference = options.project ?? config.project ?? path.basename(directory);
    const api = await client();
    const deployment = await api.deployFolder(directory, { project: reference, production: options.prod === true, config, ...progress });
    const result = { success: true, project: deployment.project?.slug ?? reference, deploymentId: deployment.id,
      status: deployment.status, environment: deployment.environment,
      productionUrl: deployment.productionUrl, previewUrl: deployment.previewUrl,
      url: deployment.environment === 'production' ? deployment.productionUrl : deployment.previewUrl };
    if (isJson()) print(result);
    else print(`Deployment verified: ${result.url}`);
  });

program.command('projects').description('List projects visible to this credential.')
  .action(async () => { print(await (await client()).request('/projects')); });

program.command('status [deployment-id]').description('Read deployment status, or the latest deployment for this project.')
  .option('--project <name>', 'Project ID, name, or slug')
  .action(async (id, options) => { const api = await client(); print(await resolveDeployment(api, id, options.project)); });

program.command('logs [deployment-id]').description('Read actual deployment logs.')
  .option('--project <name>', 'Project ID, name, or slug')
  .option('--follow', 'Poll logs until the deployment reaches a terminal state')
  .action(async (id, options) => {
    const api = await client();
    const deployment = await resolveDeployment(api, id, options.project);
    if (options.follow) print(await api.wait(deployment.id, isJson() ? {} : progress));
    else {
      const result = await api.request<{ logs: { message: string }[] }>(`/deployments/${encodeURIComponent(deployment.id)}/logs`);
      if (isJson()) print(result); else print(result.logs.map(log => log.message).join('\n'));
    }
  });

program.command('rollback <deployment-id>').description('Activate an existing retained production artifact without rebuilding.')
  .requiredOption('--prod', 'Explicitly authorize changing the production website')
  .action(async id => {
    const api = await client();
    const result = await api.request<Deployment>(`/deployments/${encodeURIComponent(id)}/rollback`, {
      method: 'POST', body: JSON.stringify({ authorizeProduction: true }),
    });
    print(result);
  });

program.command('open').description('Open the project production URL in your default browser.')
  .option('--project <name>', 'Project ID, name, or slug')
  .action(async options => {
    const api = await client();
    const project = await resolveProject(api, options.project);
    if (!project.productionUrl || !project.currentDeploymentId) throw new Error('This project has no active production deployment.');
    if (project.status && project.status !== 'active') throw new Error(`Project is ${project.status}; restore it before opening production.`);
    const url = new URL(project.productionUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid production URL.');
    if (!isJson()) {
      const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32.exe' : 'xdg-open';
      const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url.toString()] : [url.toString()];
      await new Promise<void>((resolve, reject) => {
        const child = spawn(command, args, { stdio: 'ignore', windowsHide: true });
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Browser launcher exited with ${code}.`)));
      });
    }
    print({ url: project.productionUrl });
  });

program.parseAsync().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  if (isJson()) process.stdout.write(`${JSON.stringify({ success: false, error: message })}\n`);
  else process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
});
