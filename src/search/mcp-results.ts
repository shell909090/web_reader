import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Item } from '../types.ts';
import { webItems } from './common.ts';

const rowSchema = z.object({
  title: z.string().nullish(),
  url: z.string().url(),
  description: z.string().nullish(),
  text: z.string().nullish(),
  excerpts: z.array(z.string()).optional(),
});
const rowsSchema = z.array(rowSchema);

/** Decode structured MCP output or its JSON text equivalent. */
export function toolData(result: CallToolResult): unknown {
  if (result.structuredContent) return result.structuredContent;
  const text = result.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Convert a provider's structured search rows into the common result contract. */
export function structuredItems(source: string, rows: unknown, limit: number): Item[] {
  const parsed = rowsSchema.safeParse(rows);
  if (!parsed.success) throw new Error(`${source}: invalid search results`);
  return webItems(
    source,
    parsed.data.map((row) => ({
      title: row.title ?? row.url,
      url: row.url,
      description: row.description ?? row.excerpts?.join('\n') ?? row.text ?? undefined,
    })),
    limit,
  );
}

/** Parse Exa's documented text result blocks without mining unrelated links. */
export function exaTextItems(text: string, limit: number): Item[] {
  const blocks = text.split(/(?=^Title: )/m).filter((block) => block.startsWith('Title: '));
  const rows = blocks.map((block) => {
    const title = /^Title: (.+)$/m.exec(block)?.[1];
    const url = /^URL: (https?:\/\/\S+)$/m.exec(block)?.[1];
    const content = /^(?:Text: |Highlights:\s*\n)([\s\S]*)/m.exec(block)?.[1];
    return { title, url, text: content?.trim() };
  });
  if (!rows.length) {
    if (/^No (?:search )?results found[.!]?\s*$/i.test(text.trim())) return [];
    throw new Error('exa: unrecognized MCP search response');
  }
  return structuredItems('exa', rows, limit);
}
