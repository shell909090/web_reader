import { OSCHINA_ARTICLE, readOSChina } from './feeds/oschina-detail.ts';
import { makeLogger, httpGet, extractMarkdown, type Ctx } from '../lib.ts';
import { loadPlugin } from './plugin-loader.ts';

export async function readUrls({ urls }: { urls: string[] }) {
  const chunks: string[] = [];
  for (const url of urls) {
    try {
      const md = OSCHINA_ARTICLE.test(url)
        ? await readOSChina(
            { mode: 'http', httpGet, log: makeLogger('warn') },
            { source: 'oschina', title: '', url, notes: '' },
          )
        : extractMarkdown((await httpGet(url)).html, url);
      const title = decodeURIComponent(
        new URL(url).pathname.split('/').filter(Boolean).pop() ?? url,
      );
      chunks.push(`---\n# ${title}\n\n${md}\n`);
    } catch (err) {
      chunks.push(
        `---\n# Error fetching ${url}\n\n${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }
  return { content: [{ type: 'text' as const, text: chunks.join('\n') }] };
}

export async function search({
  source,
  query,
  limit,
}: {
  source: string;
  query: string;
  limit?: number;
}) {
  const log = makeLogger('warn');
  const plugin = await loadPlugin(source, log);
  if (!plugin)
    return {
      content: [{ type: 'text' as const, text: `Error: unknown source "${source}"` }],
      isError: true,
    };
  if (!plugin.search)
    return {
      content: [{ type: 'text' as const, text: `Error: "${source}" does not support search` }],
      isError: true,
    };
  const ctx: Ctx = { mode: 'http', httpGet, log };
  const items = await plugin.search(ctx, query, limit ?? 10);
  return { content: [{ type: 'text' as const, text: JSON.stringify(items, null, 2) }] };
}
