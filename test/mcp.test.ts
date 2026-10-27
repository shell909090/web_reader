import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test(
  'MCP stdio exposes tools and validates arguments with the installed SDK and Zod',
  { timeout: 15000 },
  async () => {
    const client = new Client({ name: 'web-reader-test', version: '1.0.0' });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', 'read.ts', '--mcp'],
      stderr: 'pipe',
    });
    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      assert.deepEqual(tools.map((tool) => tool.name).sort(), ['list_news', 'read_url', 'search']);
      const result = await client.callTool({
        name: 'list_news',
        arguments: { sources: 'not-a-source', limit: 1 },
      });
      assert.equal(result.isError, true);
      const invalid = await client.callTool({
        name: 'list_news',
        arguments: { sources: 'yahoo', limit: 0 },
      });
      assert.equal(invalid.isError, true);
    } finally {
      await client.close();
    }
  },
);
