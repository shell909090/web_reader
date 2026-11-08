import { extractMarkdown, type Ctx, type Item } from '../../lib.ts';

export const OSCHINA_ARTICLE = /^https:\/\/www\.oschina\.net\/news\/(\d+)(?:[/?#]|$)/;

type NewsResponse = {
  success?: boolean;
  result?: { title?: string; detail?: string; type?: number; originalUrl?: string };
};

/** Read OSChina article content from the API used by its web application. */
export async function readOSChina(ctx: Ctx, item: Item): Promise<string> {
  const id = OSCHINA_ARTICLE.exec(item.url)?.[1];
  if (!id) throw new Error('Invalid OSChina article URL');
  const url = `https://apiv1.oschina.net/oschinapi/new/detail?id=${id}`;
  ctx.log.debug('Fetching OSChina article API', { url });
  const { status, html } = await ctx.httpGet(url, {
    headers: { Referer: 'https://www.oschina.net/' },
  });
  if (status !== 200) throw new Error(`OSChina article API returned HTTP ${status}`);
  const data: NewsResponse | null = JSON.parse(html);
  if (data?.success !== true || !data.result)
    throw new Error('OSChina article API returned no article');
  return renderArticle(data.result, item.url);
}

function renderArticle(article: NonNullable<NewsResponse['result']>, url: string): string {
  if (article.type === 5)
    throw new Error('OSChina article is an external redirect; read the publisher URL directly');
  if (typeof article.detail !== 'string' || !article.detail.trim())
    throw new Error('OSChina article API returned empty content');
  const md = extractMarkdown(`<html><body><article>${article.detail}</article></body></html>`, url);
  const title = typeof article.title === 'string' ? article.title.replace(/\s+/g, ' ').trim() : '';
  return title ? `# ${title}\n\n${md}` : md;
}
