import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
type Context = { params: Promise<{ projectSlug: string; sitePath?: string[] }> };

async function viewer(request: NextRequest, context: Context, head = false) {
  const { projectSlug, sitePath = [] } = await context.params;
  if (!/^[a-z0-9][a-z0-9-]{0,49}$/.test(projectSlug)) return new Response(null, { status: 404 });
  const endpoint = new URL(`/api/v1/public/sites/${encodeURIComponent(projectSlug)}`, process.env.API_ORIGIN || 'http://localhost:4100');
  const deployment = request.nextUrl.searchParams.get('deployment');
  if (deployment) endpoint.searchParams.set('deployment', deployment);

  try {
    const result = await fetch(endpoint, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!result.ok) return new Response(head ? null : 'Website unavailable', { status: result.status === 404 ? 404 : 502, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } });
    const metadata = await result.json() as { url?: unknown };
    if (typeof metadata.url !== 'string') throw new Error('Invalid website address');
    const target = new URL(metadata.url);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.origin === request.nextUrl.origin) throw new Error('Website origin must be isolated');
    target.pathname = '/' + sitePath.map(encodeURIComponent).join('/');
    if (request.nextUrl.pathname.endsWith('/') && sitePath.length) target.pathname += '/';
    target.search = '';
    target.hash = '';
    for (const [key, value] of request.nextUrl.searchParams) if (key !== 'deployment') target.searchParams.append(key, value);
    const headers = {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': `default-src 'none'; frame-src ${target.origin}; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
    };
    return new Response(head ? null : `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(projectSlug)}</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}iframe{display:block;width:100%;height:100%;border:0}</style></head><body><iframe title="${escapeHtml(projectSlug)} website" src="${escapeHtml(target.toString())}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads" referrerpolicy="no-referrer" allow="fullscreen"></iframe></body></html>`, { headers });
  } catch {
    return new Response(head ? null : 'Website temporarily unavailable', { status: 502, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

export const GET = (request: NextRequest, context: Context) => viewer(request, context);
export const HEAD = (request: NextRequest, context: Context) => viewer(request, context, true);
