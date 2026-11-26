#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import path from 'node:path';
import { lstat } from 'node:fs/promises';
import { DeployHubClient, readConfig, type Deployment, type Project } from '@deployhub/cli';
import { authorizePath } from './authorization.js';

const token = process.env.DEPLOYHUB_TOKEN;
if (!token) { process.stderr.write('DEPLOYHUB_TOKEN is required.\n'); process.exit(1); }
const api = new DeployHubClient(process.env.DEPLOYHUB_URL ?? 'http://localhost:4100', token);
const allowedRoots = (process.env.DEPLOYHUB_ALLOWED_ROOTS ?? '').split(path.delimiter).filter(Boolean);
const server = new McpServer({ name: 'deployhub', version: '0.1.0' });
const reference = z.string().min(1).max(200);
const productionArgs = {
  production: z.boolean().default(false).describe('Whether this changes the public production website.'),
  authorizeProduction: z.boolean().default(false).describe('Set true only after the user explicitly authorized this production change.'),
};
const annotations = { destructiveHint: false, idempotentHint: false, openWorldHint: true };
const output = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] });
const protect = <T>(fn: (args: T) => Promise<unknown>) => async (args: T) => {
  try { return output(await fn(args)); }
  catch (error) { return { ...output({ error: error instanceof Error ? error.message : String(error) }), isError: true }; }
};
function requireProductionAuthorization(args: { production: boolean; authorizeProduction: boolean }): void {
  if (args.production && !args.authorizeProduction) throw new Error('Production deployment requires explicit user authorization and authorizeProduction=true.');
}
async function project(reference: string): Promise<Project> {
  const result = await api.findProject(reference);
  if (!result) throw new Error(`Project not found: ${reference}`);
  return result;
}

server.registerTool('create_project', {
  description: 'Create a DeployHub project. This does not deploy a website.',
  inputSchema: { name: reference, framework: z.string().default('auto') }, annotations,
}, protect(async ({ name, framework }: { name: string; framework: string }) =>
  api.request('/projects', { method: 'POST', body: JSON.stringify({ name, framework }) })));

server.registerTool('list_projects', {
  description: 'List projects allowed by the API key.', inputSchema: {}, annotations: { readOnlyHint: true },
}, protect(async () => api.request('/projects')));

const folderSchema = { project: reference, directory: z.string().describe('Absolute path to an explicitly authorized local website directory.'), ...productionArgs };
async function deployFolder(args: { project: string; directory: string; production: boolean; authorizeProduction: boolean }, requireExisting = false): Promise<Deployment> {
  requireProductionAuthorization(args);
  const directory = await authorizePath(args.directory, allowedRoots);
  if (!(await lstat(directory)).isDirectory()) throw new Error('Source must be a directory.');
  if (requireExisting) await project(args.project);
  const config = await readConfig(directory);
  return api.deployFolder(directory, { project: args.project, production: args.production, config });
}
server.registerTool('deploy_local_folder', {
  description: 'Package a local website folder, upload it, wait for a real health-checked deployment, and return its verified URL. Preview is the default. Local access is restricted by DEPLOYHUB_ALLOWED_ROOTS.',
  inputSchema: folderSchema, annotations,
}, protect(args => deployFolder(args)));

server.registerTool('update_website', {
  description: 'Deploy a new immutable version to an existing project. Production updates require explicit authorization.',
  inputSchema: folderSchema, annotations: { ...annotations, destructiveHint: true },
}, protect(args => deployFolder(args, true)));

server.registerTool('deploy_website', {
  description: 'Upload a local ZIP archive under an explicitly authorized project directory, and wait for verified deployment. Remote MCP cannot read local files: run this bridge on the computer containing the archive.',
  inputSchema: { project: reference, archivePath: z.string(), ...productionArgs }, annotations,
}, protect(async args => {
  requireProductionAuthorization(args);
  const archive = await authorizePath(args.archivePath, allowedRoots);
  const stat = await lstat(archive);
  if (!stat.isFile() || path.extname(archive).toLowerCase() !== '.zip') throw new Error('Source must be a ZIP file.');
  if (stat.size > 250 * 1024 * 1024) throw new Error('Archive exceeds 250 MiB.');
  const target = await api.ensureProject(args.project);
  const deployment = await api.upload(target.id, archive, {}, args.production);
  return api.wait(deployment.id);
}));

server.registerTool('get_deployment_status', {
  description: 'Read actual persisted deployment status.', inputSchema: { deploymentId: reference }, annotations: { readOnlyHint: true },
}, protect(async args => api.request(`/deployments/${encodeURIComponent(args.deploymentId)}`)));

server.registerTool('get_deployment_logs', {
  description: 'Read actual deployment logs.', inputSchema: { deploymentId: reference }, annotations: { readOnlyHint: true },
}, protect(async args => api.request(`/deployments/${encodeURIComponent(args.deploymentId)}/logs`)));

server.registerTool('get_website_url', {
  description: 'Read a project and its production URL. Only an active production deployment means the URL is live.',
  inputSchema: { project: reference }, annotations: { readOnlyHint: true },
}, protect(async args => {
  const target = await project(args.project);
  return { project: target.slug,
    productionUrl: target.currentDeploymentId && target.status === 'active' ? target.productionUrl : null,
    generatedProductionUrl: target.productionUrl,
    activeDeploymentId: target.currentDeploymentId ?? null,
    status: target.status, note: 'Generated URLs become available only after a production deployment is live.' };
}));

for (const action of ['promote', 'rollback'] as const) {
  server.registerTool(`${action}_deployment`, {
    description: `${action === 'promote' ? 'Promote a verified preview artifact' : 'Roll back to a retained successful artifact'} to production without rebuilding. Requires explicit production authorization.`,
    inputSchema: { deploymentId: reference, authorizeProduction: z.boolean() },
    annotations: { ...annotations, destructiveHint: true },
  }, protect(async args => {
    if (!args.authorizeProduction) throw new Error('Explicit user authorization is required to change production.');
    return api.request(`/deployments/${encodeURIComponent(args.deploymentId)}/${action}`, {
      method: 'POST', body: JSON.stringify({ authorizeProduction: true }),
    });
  }));
}

server.registerTool('connect_custom_domain', {
  description: 'Request custom domain connection and return DNS ownership verification instructions. Routing is enabled only after ownership verification.',
  inputSchema: { project: reference, hostname: z.string().min(3).max(253) }, annotations,
}, protect(async args => {
  const target = await project(args.project);
  return api.request(`/projects/${encodeURIComponent(target.id)}/domains`, { method: 'POST', body: JSON.stringify({ hostname: args.hostname }) });
}));

server.registerTool('get_server_status', {
  description: 'Read actual server monitoring metrics.', inputSchema: {}, annotations: { readOnlyHint: true },
}, protect(async () => api.request('/metrics')));

await server.connect(new StdioServerTransport());
