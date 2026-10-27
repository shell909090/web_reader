import { httpGet, type Ctx, type Logger } from '../../lib.ts';
import type { ParsedArgs } from './types.ts';
import { loadPlugin } from '../plugin-loader.ts';
import { writeOutput } from './io.ts';
import { extractMarkdown, type Plugin, type Item } from '../../lib.ts';
import { KNOWN_SOURCES } from './sources.ts';
import { USAGE } from './usage.ts';
import { readStdinLines, logError } from './io.ts';

async function readArticle(
  url: string,
  dispatch: { pattern: RegExp; plugin: Plugin }[],
  log: Logger,
): Promise<string> {
  const matched = dispatch.find(({ pattern }) => pattern.test(url));
  let md: string;
  let title: string;
  if (matched) {
    const ctx: Ctx = { mode: 'http', httpGet, log };
    const item: Item = { source: matched.plugin.id, title: '', url, notes: '' };
    md = await matched.plugin.detail!(ctx, item);
    title = url;
  } else {
    const { html } = await httpGet(url);
    md = extractMarkdown(html, url);
    title = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? url);
  }
  return `---\n# ${title}\n\n${md}\n`;
}

export async function runDetail(
  args: Extract<ParsedArgs, { mode: 'detail' }>,
  log: Logger,
): Promise<number> {
  const urls = args.urls.length > 0 ? args.urls : await readStdinLines();
  if (urls.length === 0) {
    log.error('detail mode requires URLs — pass as arguments or pipe via stdin');
    process.stderr.write(USAGE + '\n');
    return 2;
  }

  const allPlugins = (
    await Promise.all([...KNOWN_SOURCES].map((id) => loadPlugin(id, log)))
  ).filter((p): p is Plugin => p !== null);

  const detailDispatch = allPlugins
    .filter((p) => p.urlPattern && p.detail)
    .map((p) => ({ pattern: p.urlPattern!, plugin: p }));

  const chunks: string[] = [];
  let failures = 0;
  for (const url of urls) {
    try {
      const chunk = await readArticle(url, detailDispatch, log);
      chunks.push(chunk);
    } catch (err) {
      failures++;
      logError({ source: 'detail', url, stage: 'detail', err });
    }
  }

  const output = chunks.join('\n');
  await writeOutput(args.out, output);

  if (failures === urls.length) return 3;
  return 0;
}
