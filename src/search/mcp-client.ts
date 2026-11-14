import { SearchUnavailable, statusFailure } from './errors.ts';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolResultSchema, type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { fetch as undiciFetch } from 'undici';
import { requestDispatcher } from '../http/dispatcher.ts';

export type SearchToolRequest = {
  source: string;
  endpoint: string;
  tool: string;
  args: Record<string, unknown>;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

function endpointUrl(request: SearchToolRequest): URL {
  const url = new URL(request.endpoint);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash)
    throw new Error('MCP endpoint must not contain credentials, query or fragment');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local && !request.headers))
    throw new Error('MCP endpoints require HTTPS (keyless localhost HTTP is allowed)');
  return url;
}

/** Call one hosted search tool with bounded lifetime and no authentication fallback. */
export async function callSearchTool(request: SearchToolRequest): Promise<CallToolResult> {
  const url = endpointUrl(request);
  const controller = new AbortController();
  const dispatcher = requestDispatcher(controller.signal);
  const timeout = request.timeoutMs ?? 30000;
  const timer = setTimeout(() => controller.abort(), timeout);
  const client = new Client({ name: 'web_reader', version: '0.1.0' });
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: request.headers, redirect: 'error' },
    reconnectionOptions: {
      maxRetries: 0,
      initialReconnectionDelay: 1000,
      maxReconnectionDelay: 1000,
      reconnectionDelayGrowFactor: 1,
    },
    fetch: async (input, init) => {
      const target = input instanceof Request ? input.url : String(input);
      if (new URL(target).origin !== url.origin)
        throw new Error('Cross-origin MCP request refused');
      const signal = AbortSignal.any([controller.signal, ...(init?.signal ? [init.signal] : [])]);
      const response = await undiciFetch(target, {
        method: init?.method,
        headers: Object.fromEntries(new Headers(init?.headers)),
        body: typeof init?.body === 'string' ? init.body : undefined,
        dispatcher,
        signal,
        redirect: 'error',
      });
      // Undici and the SDK use equivalent Response objects with separate type declarations.
      return response as unknown as Response;
    },
  });
  try {
    await client.connect(transport, { timeout, signal: controller.signal });
    const result = await client.callTool(
      { name: request.tool, arguments: request.args },
      CallToolResultSchema,
      { timeout, signal: controller.signal },
    );
    if (result.isError) throw new Error('Tool rejected search');
    return CallToolResultSchema.parse(result);
  } catch (error) {
    if (error instanceof StreamableHTTPError)
      // Remote errors may contain credentials or server-provided instructions.
      throw statusFailure(request.source, error.code ?? 400);
    if (controller.signal.aborted || error instanceof TypeError)
      throw new SearchUnavailable(`${request.source}: MCP transport unavailable`);
    // eslint-disable-next-line preserve-caught-error
    throw new Error(
      `${request.source}: MCP search failed (timeout, transport, protocol or tool error); no fallback attempted`,
    );
  } finally {
    clearTimeout(timer);
    controller.abort();
    // Close both resources even when the peer has already disconnected.
    await Promise.allSettled([client.close(), dispatcher.destroy()]);
  }
}
