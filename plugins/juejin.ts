// Juejin list plugin — HTTP-based, uses the recommend API (POST).

import type { Plugin, Ctx, Item } from '../lib.ts';

const API_URL =
  'https://api.juejin.cn/recommend_api/v1/article/recommend_all_feed?aid=2608&uuid=&cursor=0&limit=20&sort_type=200';

// Internal types — not exported
type JuejinArticle = { article_id: string; title: string; brief_content: string };
type JuejinItem = {
  item_info: { article_info: JuejinArticle; author_user_info: { user_name: string } };
};
type JuejinResponse = { err_no: number; data: JuejinItem[] };

const plugin: Plugin = {
  id: 'juejin',
  needsBrowser: false,

  async list(ctx: Ctx, opts: { limit: number }): Promise<Item[]> {
    ctx.log.debug('Fetching Juejin recommend feed', { url: API_URL });

    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Referer: 'https://juejin.cn/' },
      body: JSON.stringify({
        cursor: '0',
        id_type: 2,
        limit: Math.min(opts.limit, 50),
        sort_type: 200,
      }),
    });

    // Cast via unknown — fetch returns Response whose json() yields unknown
    const json = (await resp.json()) as JuejinResponse;

    if (json.err_no !== 0) throw new Error(`Juejin API error: ${json.err_no}`);

    const items: Item[] = json.data.slice(0, opts.limit).map((entry) => {
      const { article_id, title } = entry.item_info.article_info;
      const author = entry.item_info.author_user_info.user_name;
      return {
        source: 'juejin',
        title,
        url: `https://juejin.cn/post/${article_id}`,
        notes: author || '掘金',
      };
    });

    ctx.log.debug(`Parsed ${items.length} items from Juejin feed`);
    return items;
  },
};

export default plugin;
