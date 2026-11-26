import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('local MCP stdio advertises all tools, authenticates API calls and refuses unauthorized production', async () => {
  const received: string[] = [];
  const apiServer = http.createServer((request, response) => {
    assert.equal(request.headers.authorization, 'Bearer test-scoped-key');
    received.push(request.url ?? '');
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/api/v1/projects') response.end(JSON.stringify({ projects: [{ id: 'prj_local', name: 'Local', slug: 'local' }] }));
    else { response.statusCode = 404; response.end(JSON.stringify({ error: 'unknown' })); }
  });
  await new Promise<void>(resolve => apiServer.listen(0, '127.0.0.1', resolve));
  const address = apiServer.address();
  assert.ok(address && typeof address === 'object');
  const serverPath = fileURLToPath(new URL('../dist/index.js', import.meta.url));
  const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath],
    env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '',
      DEPLOYHUB_TOKEN: 'test-scoped-key', DEPLOYHUB_URL: `http://127.0.0.1:${address.port}`,
      DEPLOYHUB_ALLOWED_ROOTS: path.resolve('.') }, stderr: 'pipe' });
  const client = new Client({ name: 'deployhub-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map(tool => tool.name).sort(), ['create_project', 'list_projects', 'deploy_website', 'deploy_local_folder', 'get_deployment_status', 'get_deployment_logs', 'get_website_url', 'update_website', 'promote_deployment', 'rollback_deployment', 'connect_custom_domain', 'get_server_status'].sort());
    const result = await client.callTool({ name: 'list_projects', arguments: {} });
    assert.equal(result.isError, undefined);
    assert.equal((result.content as { text: string }[])[0].text.includes('prj_local'), true);
    const denied = await client.callTool({ name: 'deploy_local_folder', arguments: {
      project: 'local', directory: path.resolve('.'), production: true, authorizeProduction: false,
    } });
    assert.equal(denied.isError, true);
    assert.match((denied.content as { text: string }[])[0].text, /explicit user authorization/);
    assert.deepEqual(received, ['/api/v1/projects']);
  } finally {
    await client.close();
    await new Promise<void>((resolve, reject) => apiServer.close(error => error ? reject(error) : resolve()));
  }
});
