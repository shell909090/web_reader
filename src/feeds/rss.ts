export function extractText(block: string, tag: string): string {
  const m = block.match(
    new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]+?)(?:\\]\\]>)?</${tag}>`, 'i'),
  );
  return m ? m[1].trim() : '';
}

export function rssLink(block: string): string {
  return block.match(/<link>\s*([^<\s]+)/i)?.[1]?.trim() ?? extractText(block, 'guid');
}

export function rssBlocks(xml: string): string[] {
  return [...xml.matchAll(/<item>([\s\S]+?)<\/item>/gi)].map((match) => match[1]);
}
