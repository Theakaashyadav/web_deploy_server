import path from 'node:path';
import { dataDirectory } from '../../database/src/index.js';
export const config = {
  deploymentMode: process.env.DEPLOYMENT_MODE === 'legacy' ? 'legacy' : 'github-static',
  sitePathPrefix: '/admin',
  dataDirectory,
  uploads: path.join(dataDirectory, 'uploads'),
  workspaces: path.join(dataDirectory, 'workspaces'),
  artifacts: path.join(dataDirectory, 'artifacts'),
  siteDomain: process.env.SITE_DOMAIN || 'localhost',
  siteProtocol: process.env.SITE_PROTOCOL || 'http',
  sitePort: process.env.SITE_PORT || '4101',
  apiPort: Number(process.env.API_PORT || 4100),
  runtimePort: Number(process.env.RUNTIME_PORT || 4101),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 104857600),
  maxExtractedBytes: Number(process.env.MAX_EXTRACTED_BYTES || 536870912),
  maxFiles: Number(process.env.MAX_FILES || 10000),
  buildTimeoutMs: Number(process.env.BUILD_TIMEOUT_MS || 600000),
  buildImage: process.env.BUILD_IMAGE || 'node:22-alpine',
  dashboardOrigin: process.env.DASHBOARD_ORIGIN || 'http://localhost:3100',
};
export function siteUrl(slug: string) {
  return `${config.siteProtocol}://${slug}.${config.siteDomain}${config.sitePort && !['80','443'].includes(config.sitePort) ? ':' + config.sitePort : ''}`;
}
export const runtimeProductionUrl = (project: { slug: string }) => siteUrl(project.slug);
export const runtimePreviewUrl = (project: { slug: string }, deployment: { id: string }) => siteUrl(`${project.slug}--${deployment.id}`);
export const productionUrl = (project: { slug: string }) => config.deploymentMode === 'legacy' ? runtimeProductionUrl(project) : `${new URL(config.dashboardOrigin).origin}${config.sitePathPrefix}/${encodeURIComponent(project.slug)}`;
export const previewUrl = (project: { slug: string }, deployment: { id: string }) => config.deploymentMode === 'legacy' ? runtimePreviewUrl(project,deployment) : `${productionUrl(project)}?deployment=${encodeURIComponent(deployment.id)}`;
export function slugify(name: string) {
  const slug = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 35).replace(/-$/,'');
  return slug || 'website';
}
