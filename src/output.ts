import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Item } from './types.ts';

/** Write items to outDir/index.json (UTF-8, 2-space indent, creates dir if needed). */
export async function writeListJson(outDir: string, items: Item[]): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'index.json'), JSON.stringify(items, null, 2), 'utf-8');
}

/** Write a single article to outDir/{source}-{NNNN}.md and return the relative path. */
export async function writeArticleMd(
  outDir: string,
  source: string,
  index: number, // 1-based, per-source
  title: string,
  markdown: string,
): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const filename = `${source}-${String(index).padStart(4, '0')}.md`;
  const content = `# ${title}\n\n${markdown}\n`;
  await writeFile(join(outDir, filename), content, 'utf-8');
  return filename; // relative path (just the filename, caller prepends outDir if needed)
}
