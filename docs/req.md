# 新闻抓取工具需求

## 1. 目标

一个 Node.js 脚本，从多家新闻网站抓取最新文章，统一输出为 markdown，供后续 LLM / 人工处理。数据源清单见 `AGENTS.md` 的"常用新闻网站"。

## 2. 技术栈

**核心原则：HTTP 优先，Playwright 兜底。** 能用 `fetch` 直接 GET 拿到 HTML 的源就走 HTTP；只有遇到以下情况才升级到 Playwright：

- 列表/正文需要 JS 渲染才出现（SPA、懒加载）
- 站点有 Cloudflare 或类似 bot 挑战，纯 HTTP 拿到 403 / 挑战页
- 站点要 cookie / session warmup 才放行

启动 Playwright 是有代价的（冷启 1-2 秒、内存 200M+），能省则省。

技术栈：

- 运行时：Node.js（≥ 20，用原生 `fetch`）
- HTTP 路径：原生 `fetch` + `cheerio`（jQuery-like 选择器，解析快）
- Playwright 路径：`playwright`（chromium，headless）—— 仅按需启动
- 正文抽取：`@mozilla/readability` + `jsdom` 作为通用算法；个别站点写专门 selector 覆盖
- HTML → Markdown：`turndown`（保留 GFM 表格、删除空段）
- 不引入数据库，所有产物落盘到 `data/news/`

## 2.5 依赖与安装

- 项目根建 `package.json`，依赖锁在 `package-lock.json`：
  - `playwright`、`@mozilla/readability`、`jsdom`、`turndown`、`cheerio`
- 浏览器二进制装到全局共享目录 `~/.cache/ms-playwright/`（机器级共享，当前已有 chromium-1217）
- 首次安装：`npm install` → `npx playwright install chromium`
- 升级 playwright npm 包后**必须**重跑 `npx playwright install chromium`，否则报 "browser not found"
- 不锁 chromium 版本号，跟着 npm 包走；旧版本目录定期手动清
- 不依赖 `playwright install-deps`（需 sudo），缺系统库再单独处理

## 3. 数据源（首期 6 家）

| Source ID | 站点 | URL | 分类 | 抓取方式 | 备注 |
|---|---|---|---|---|---|
| `hn` | Hacker News | `https://news.ycombinator.com/` | AI/IT | HTTP | HTML 极简，无需 readability |
| `bbc` | BBC News | `https://www.bbc.com/news` | 综合 | HTTP | 静态渲染好，readability 友好 |
| `techcrunch` | TechCrunch | `https://techcrunch.com/` | AI/IT | HTTP | WordPress，结构稳 |
| `sina` | 新浪新闻 | `https://news.sina.com.cn/` | 中文综合 | HTTP | 列表页静态，正文注意编码 |
| `reuters` | Reuters | `https://www.reuters.com/` | 财经 / 综合 | Playwright | 有 bot 检测，需真浏览器 + 真 viewport |
| `cnbc-ai` | CNBC AI | `https://www.cnbc.com/ai-artificial-intelligence/` | 财经 / AI | Playwright | JS 渲染列表，需 `networkidle` |

"抓取方式"是初判，实施时如果 HTTP 实际能搞定 reuters / cnbc，就降级到 HTTP（反之亦然）。判定依据：抓回的 HTML 里有没有目标元素。

后续按需扩展到 AGENTS.md 全部 ~20 个源。新增一家不应影响已有源。

## 4. 架构

```
news_scraper.js
├── fetchers/                  per-source 原始抓取
│   ├── hn.js          → fetchHN(page, opts) → RawItem[]
│   ├── bbc.js         → fetchBBC(page, opts)
│   ├── techcrunch.js
│   ├── reuters.js
│   ├── sina.js
│   └── cnbc.js
├── extract.js                 通用正文抽取 + markdown 转换
│   ├── extractArticle(html, url) → { title, byline, content_md, ... }
│   └── overrides/             针对 readability 失效的站点
└── news_scraper.js            CLI 入口 + 调度
```

### 4.1 Fetcher 契约

每个 fetcher 导出两个字段：

```js
module.exports = {
  needsBrowser: false,             // true 时由 runner 注入 Playwright page
  fetch: async (ctx, { mode, limit }) => RawItem[],
}
```

- `needsBrowser: false` 时，`ctx` 是 `{ httpGet(url, opts) → { status, html, headers } }`。内部用 `cheerio` 解 HTML。
- `needsBrowser: true` 时，`ctx` 是 `{ page }`（Playwright Page，由 runner 启动 browser/context 后注入）。
- runner 根据 `needsBrowser` 决定要不要启 chromium。如果一次跑里所有 source 都是 HTTP，**不启** chromium。

`RawItem` 形如：

```
{
  source: 'hn',
  url: 'https://...',
  title: '...',
  published_at: '2026-05-12T...Z' | null,
  summary: string | null,          // 列表页能拿到的就拿，拿不到 null
  raw_html: string | null,         // detail 模式才有
}
```

- `mode: 'list'`：只抓首页/版块页，拿到 `{title, url, summary, published_at}`，不进文章页。
- `mode: 'detail'`：先按 list 拿到 url 列表，再逐篇拿正文 HTML，填 `raw_html`。
- `limit`：最多保留多少条（默认 20）。

Fetcher 内部只关心"怎么从这个站点的 DOM 拿到列表 / 正文 HTML"，不做正文清洗，不做 markdown 转换。

实施顺序建议：每个新 fetcher 先尝试 HTTP（`needsBrowser: false`），如果抓回的 HTML 里没有目标元素，再翻到 `needsBrowser: true`，避免上来就吃 Playwright 的启动成本。

### 4.2 Extractor 契约

```js
extractArticle(rawHtml, url) → {
  title, byline, published_at, content_md, word_count, lang
}
```

- 默认走 `@mozilla/readability`，把 `article.content` 喂给 `turndown`。
- 若 url 命中 `overrides/{host}.js`，用 override 的 selector + 自定义清洗。
- 返回的 `content_md` 应：去广告区块、去"相关阅读"、去 nav，保留段落 / 标题 / 列表 / 表格 / 链接，图片转 `![alt](src)`。
- list 模式不调用此函数。

### 4.3 CLI

```
node news_scraper.js --sources hn,bbc --mode list --limit 20 --out data/news/
node news_scraper.js --sources all --mode detail --limit 10
```

参数：
- `--sources`：逗号分隔的 source id，或 `all`
- `--mode`：`list` | `detail`，默认 `list`
- `--limit`：每源最多抓几条，默认 20
- `--out`：输出目录，默认 `data/news/`
- `--concurrency`：并发跑几个 source，默认 2（避免被联合限速）

## 5. 输出

落到 `data/news/YYYYMMDD/`：

- `index.json`：本次跑的所有 RawItem 元数据（不含 raw_html / content_md），便于检索
- `{source}-{slug}.md`：每篇文章一个 md 文件（仅 detail 模式）
  - 文件头 YAML frontmatter：`source`, `url`, `title`, `published_at`, `fetched_at`
  - 正文为 `content_md`
- `{source}-list.md`（list 模式）：单文件汇总该 source 的列表，每条一段
  - 标题、链接、可选 summary、可选发布时间

文件名 slug 用 url 末段或 title 取前 40 字、去非 `[a-z0-9-]`。

## 6. 健壮性要求

- 单个 source 失败不影响其他 source，错误写 `data/news/YYYYMMDD/_errors.log`
- 每篇文章抓取超时 30s，整个脚本默认最长 10 分钟
- HTTP 客户端：统一带 UA / `Accept-Language` / 合理 `Accept`，5xx 用一次指数退避
- Playwright context 复用：所有需要浏览器的 source 共享一个 browser，每个 source 一个 context（隔离 cookie）；不需要浏览器时**不启动**
- UA / viewport / locale 用一个常量集中配置，方便后续调整
- 重试：单页失败重试 1 次，第二次失败则跳过并记录
- 不存证 cookies，每次跑全新 context（之后如果某站需要登录再单独处理）

## 7. 不做的事

- 不做调度（cron 在外面接，例如复用项目里的方式）
- 不做去重 / 历史对比（下游处理）
- 不做摘要 / 翻译 / 翻新（LLM 在下游做）
- 不做 RSS（部分源有 RSS 可绕开抓取，但首期统一走 HTML 路径，便于一致性）

## 8. 验收

- `node news_scraper.js --sources hn --mode list` 能输出 `data/news/YYYYMMDD/hn-list.md`，含 ≥10 条
- `node news_scraper.js --sources bbc --mode detail --limit 3` 能输出 3 个独立 md 文件，正文可读、无导航污染
- 任何一家源挂掉，其他源照常输出
- 新增第 7 家源只需要新建 `fetchers/xxx.js` 和（如有必要）`extract/overrides/xxx.js`，不改其他文件

## 9. 待用户确认的开放项

- 部分财经源（Bloomberg、WSJ）有强反爬 / 付费墙，是否首期跳过——本文档已默认不收录
- 是否需要把 list 模式产物也按文章存 md（当前方案是单文件汇总）
- 输出目录是否要按 source 再分子目录（当前方案是平铺 + 文件名前缀）
