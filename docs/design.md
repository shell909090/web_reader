# 新闻抓取工具 设计文档

## 1. 目录结构

```
news/
├── package.json
├── tsconfig.json
├── Makefile
├── news.ts              # CLI 入口
├── lib.ts               # 公共函数库（HTTP / 浏览器 / Markdown / 输出）
├── plugins/             # 每个文件 = 一个消息源
│   ├── hn.ts
│   ├── bbc.ts
│   ├── techcrunch.ts
│   ├── sina.ts
│   ├── reuters.ts
│   └── cnbc-ai.ts
├── data/news/YYYYMMDD/  # 运行产物，不入 git
└── test/
```

新增源 = 在 `plugins/` 新建一个文件。除此之外不动任何文件。

TypeScript：源码全 `.ts`，运行用 `tsx`（`npx tsx news.ts ...`），`tsc --noEmit` 做类型检查（在 `make lint`）。不预编译到 dist。

---

## 2. 统一输出结构

**list 模式**：产出唯一一种 JSON，无论源是什么。`list.json` 是一个扁平数组，每条 record 是一个 dict（开放扩展字段）：

```ts
// 必含字段（plugin 必须提供）
type ItemCore = {
  source: string;  // 'hn' | 'bbc' | ...
  title: string;   // 新闻标题，非空
  url: string;     // 完整绝对 URL，用户用它跟进
  notes: string;   // 摘要 / 发布时间 / 评分 / 作者等，由 plugin 自由拼成的人类可读文本
};

// 实际类型：允许 plugin 追加任意字段，下游按需读
type Item = ItemCore & Record<string, unknown>;
```

`notes` 是 plugin 把所有源相关辅助信息（summary、score、published_at、author …）拼成一段文本，例如：

```
"2026-05-12 · 412 points · 187 comments"
"BBC · 2026-05-12 · Tech reporter"
```

如果 plugin 还想暴露结构化字段（比如 `score: 412`、`comments: 187`），自由追加，下游可选用。但 `title / url / notes / source` 是契约必填。

**detail 模式**：对 list 里每条，再产出一份 Markdown 文件，**只有 Markdown**（不带 frontmatter、不带 JSON 包装）。第一行 `# {title}`，第二行空行，正文跟在后面。文件名 `{source}-{NNNN}.md`，NNNN 是该 source 在本次 list 中的序号（4 位零填充，从 0001 起）；list.json 里对应 record 追加 `md_path` 字段指向该文件，调用方不靠文件名反查。这样**完全规避 CJK / 特殊字符 slug 问题**。

---

## 3. Plugin 接口

`plugins/{source}.ts` 默认导出一个 `Plugin`：

```ts
import type { Page } from 'playwright';

export type Logger = {
  debug(msg: string, meta?: unknown): void;
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
};

export type HttpResponse = { status: number; html: string; finalUrl: string };
export type HttpGetOpts = { headers?: Record<string, string>; timeoutMs?: number };

export type Ctx =
  | { mode: 'http'; httpGet(url: string, opts?: HttpGetOpts): Promise<HttpResponse>; log: Logger }
  | { mode: 'browser'; page: Page; log: Logger };

export type Item = {
  source: string;
  title: string;
  url: string;
  notes: string;
} & Record<string, unknown>;

export type Plugin = {
  id: string;                        // 与文件名一致
  needsBrowser: boolean;             // true → ctx.mode === 'browser'

  list(ctx: Ctx, opts: { limit: number }): Promise<Item[]>;

  // 可选。返回 Markdown 字符串（不含 # title 头，由 lib 拼）。
  // 不实现时，runner 用通用 readability + turndown 处理 ctx.httpGet(item.url) 的 HTML。
  detail?(ctx: Ctx, item: Item): Promise<string>;
};

const plugin: Plugin = { /* ... */ };
export default plugin;
```

约束：
- `list` 必须给每条填齐 `source / title / url / notes`；不合格 plugin 内部丢弃。
- Plugin 不写文件、不打印进度——所有 IO 由 `lib.ts` 负责。
- Plugin 之间不互相 import。

---

## 4. 公共函数库 `lib.ts`

单文件，导出：

```ts
// HTTP
export function httpGet(url: string, opts?: HttpGetOpts): Promise<HttpResponse>;
//  - 默认 UA / Accept / Accept-Language
//  - timeoutMs 默认 30000，AbortController 实现
//  - 5xx / 网络错重试 1 次（指数退避）；4xx 不重试
//  - 跟随 redirect ≤5；按响应头声明的编码解码（gb2312 等 fallback）

// 浏览器
export function withBrowser<T>(
  plugins: Plugin[],
  fn: (getPage: (sourceId: string) => Promise<Page>) => Promise<T>,
): Promise<T>;
//  - 任一 plugin.needsBrowser 才启 chromium，否则不启
//  - 每个 source 一个 context（独立 cookie），fn 内通过 getPage(id) 取

// 正文 → markdown（通用）
export function extractMarkdown(html: string, url: string): string;
//  - jsdom + @mozilla/readability + turndown(GFM)
//  - 去广告区块 / nav / 尾部 "Read more / 相关阅读"

// 输出
export function writeListJson(outDir: string, items: Item[]): Promise<void>;
//  - 写 outDir/list.json，扁平数组
export function writeArticleMd(
  outDir: string,
  source: string,
  index: number,    // 1-based，per source
  title: string,
  markdown: string,
): Promise<string>;
//  - 写 outDir/{source}-{NNNN}.md，返回相对路径供回填 md_path

// 其他
export function makeLogger(level: 'debug' | 'info'): Logger;
export const CONFIG: {
  UA: string;
  VIEWPORT: { width: number; height: number };
  LOCALE_EN: string;
  LOCALE_CN: string;
  TIMEZONE: string;
  HTTP_TIMEOUT_MS: number;
  NAV_TIMEOUT_MS: number;
  TOTAL_TIMEOUT_MS: number;
  DEFAULT_LIMIT: number;
  DEFAULT_CONCURRENCY: number;
};
```

注意：没有 `slug()`——文件名走 `{source}-{NNNN}.md`，不需要从标题派生。

---

## 5. 入口 `news.ts`

职责：解析 CLI → 加载 plugins → 调度 → 调 `lib.ts` 落盘。

CLI：

```
npx tsx news.ts [--sources <ids|all>] [--mode list|detail] [--limit N] [--out DIR]
                [--concurrency N] [--debug]
```

调度伪码：

```ts
const plugins = await loadPlugins(args.sources);   // dynamic import('./plugins/{id}.ts')
const allItems: Item[] = [];

await withBrowser(plugins, async (getPage) => {
  await pAll(plugins, args.concurrency, async (p) => {
    const ctx: Ctx = p.needsBrowser
      ? { mode: 'browser', page: await getPage(p.id), log }
      : { mode: 'http', httpGet, log };

    const items = await p.list(ctx, { limit: args.limit });

    if (args.mode === 'detail') {
      let n = 0;
      for (const it of items) {
        n++;
        const md = p.detail
          ? await p.detail(ctx, it)
          : extractMarkdown((await httpGet(it.url)).html, it.url);
        const path = await writeArticleMd(outDir, p.id, n, it.title, md);
        it.md_path = path;
      }
    }
    allItems.push(...items);
  });
});

await writeListJson(outDir, allItems);
```

单源失败 → 写 `_errors.log`，其他源继续。退出码：0 至少一源成功；2 参数错；3 全部失败；4 总超时（10 分钟）。

---

## 6. 错误与日志

- `_errors.log`（在 `data/news/YYYYMMDD/` 下）：每行 JSON `{ts, source, url?, stage, message, stack}`。
- 单条文章 detail 失败：写 _errors.log，跳过该文，list 中保留该条。
- `--debug` → logger.level=debug；info 默认走 stderr，stdout 仅 CLI 自身的简短 summary。

---

## 7. 测试

- 每个 plugin：离线 `fixtures/{source}/list.html`（及若干 detail.html）+ 一份单测，断言 `list()` 产出预期 Item[]。
- `extractMarkdown`：3-5 个真实 HTML 样本，断言产出非空、不含 nav 关键字。
- `news.js` 用 mock plugin 验证：needsBrowser 路由、并发、错误隔离、总超时。
- 框架：`node --test` + `c8` 覆盖率。

---

## 8. 已确认的关键决策

- 语言：TypeScript（`.ts`，运行 `tsx`，类型检查 `tsc --noEmit`）。
- `list.json`：扁平数组，每条 record 是 dict，`source / title / url / notes` 必填，plugin 可自由追加字段。
- detail 模式文件名：`{source}-{NNNN}.md`（4 位序号），不从标题派生，无 CJK 问题；list.json record 里以 `md_path` 字段回填。

无剩余开放项，等你确认后即可写 `tasks.md`。
