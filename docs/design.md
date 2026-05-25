# 新闻抓取工具 设计文档

## 1. 目录结构

```
news/
├── package.json
├── tsconfig.json
├── Makefile
├── read.ts              # CLI 入口（含 MCP server 模式）
├── lib.ts               # 公共函数库（HTTP / 正文提取 / 输出工具 / 类型定义）
├── plugins/             # 每个文件 = 一个消息源
│   ├── hn.ts
│   ├── bbc.ts
│   ├── ... (22 个)
└── test/
    ├── fixtures/
    ├── extract.test.ts
    ├── http.test.ts
    ├── logger.test.ts
    ├── plugins/         # 每个 plugin 的单测
    ├── read.test.ts
    └── writer.test.ts
```

TypeScript 全 `.ts`，运行用 `tsx`，类型检查用 `tsc --noEmit`。不预编译到 dist。

无 Playwright 依赖，所有插件均走 HTTP 路径。

---

## 2. 输出格式

**list / query 模式**：向 stdout 输出 JSON 数组（`-o FILE` 则写文件），每条 record 格式：

```ts
type ItemCore = {
  source: string;         // plugin id，如 'hn'
  title: string;
  url: string;
  notes: string;          // 摘要/时间/评分等，由 plugin 拼成人类可读文本
  published_at?: string;  // ISO 8601 日期，有条件时提供
};
// plugin 可自由追加字段（summary, score, comments 等）
type Item = ItemCore & Record<string, unknown>;
```

`notes` 示例：`"2026-05-12 · 412 points · 187 comments"`

**detail 模式**：向 stdout 输出 Markdown，多 URL 之间用 `---\n` 分隔：

```
---
# {title（url末段decode）}

{正文 Markdown}
```

正文通过 `extractMarkdown(html, url)` 提取（readability + turndown + 尾部噪声清除）。

---

## 3. Plugin 接口

`plugins/{source}.ts` 默认导出一个 `Plugin`（`lib.ts` 中定义）：

```ts
export type Plugin = {
  id: string;
  /** 分类字典，slug → 人类标签；无则 plugin 为单一 feed */
  categories?: Record<string, string>;

  list(ctx: Ctx, opts: { limit: number; categories?: string[] }): Promise<Item[]>;

  /** 关键词搜索；仅 wiki/zhwiki/reddit 等数据源类 plugin 实现 */
  search?(ctx: Ctx, query: string, limit: number): Promise<Item[]>;

  /** 单篇正文抓取；read.ts 的 detail 模式不经此路径（直接 httpGet + extractMarkdown） */
  detail?(ctx: Ctx, item: Item): Promise<string>;
};
```

`Ctx` 目前只有 HTTP 模式（Playwright 已移除）：

```ts
export type Ctx = {
  mode: 'http';
  httpGet(url: string, opts?: HttpGetOpts): Promise<HttpResponse>;
  log: Logger;
};
```

约束：
- `list` 必须给每条填齐 `source / title / url / notes`；不合格条目 plugin 内部丢弃。
- Plugin 不写文件、不打印进度——所有 IO 由调用方负责。
- Plugin 之间不互相 import。

---

## 4. 公共函数库 `lib.ts`

导出：

```ts
// HTTP
export function httpGet(url: string, opts?: HttpGetOpts): Promise<HttpResponse>;
//  - 默认 UA / Accept / Accept-Language
//  - timeoutMs 默认 30000，AbortController 实现
//  - 5xx / 网络错重试 1 次（指数退避）；4xx 不重试
//  - 手动跟随 redirect ≤5；按响应头声明编码解码（gb2312/gbk → gbk）

// 正文提取
export function extractMarkdown(html: string, url: string): string;
//  - jsdom + @mozilla/readability + turndown(ATX heading, fenced code, GFM)
//  - 去尾部噪声（Read more / 相关阅读等正则）
//  - 压缩多余空行；内容 <200 字符抛 ExtractError

// 输出工具（供外部 / 测试使用；read.ts 主流程直接写 stdout）
export function writeListJson(outDir: string, items: Item[]): Promise<void>;
//  - 写 outDir/index.json（UTF-8，2-space indent，自动 mkdir）
export function writeArticleMd(
  outDir: string, source: string, index: number, title: string, markdown: string,
): Promise<string>;
//  - 写 outDir/{source}-{NNNN}.md，返回相对路径

// Logger / Config
export function makeLogger(level: LogLevel): Logger;
export const CONFIG: { UA, VIEWPORT, LOCALE_EN, LOCALE_CN, TIMEZONE,
                       HTTP_TIMEOUT_MS, TOTAL_TIMEOUT_MS, DEFAULT_LIMIT, DEFAULT_CONCURRENCY };
```

---

## 5. 入口 `read.ts`

### 5.1 模式推断

```
-s 存在           → list 模式
-q 存在           → query 模式
否则              → detail 模式（positional URL 或 stdin 管道）
```

### 5.2 list 模式调度伪码

```ts
const loaded = await Promise.all(sources.map(req => loadPlugin(req.id, log)));

await pConcurrent(loaded, concurrency, async ({ plugin, categories }) => {
  const ctx: Ctx = { mode: 'http', httpGet, log };
  const items = await plugin.list(ctx, { limit, categories });
  allItems.push(...items);
});

process.stdout.write(JSON.stringify(allItems, null, 2) + '\n');
```

单源失败写 stderr，其他源继续。

### 5.3 detail 模式

读取 positional URL 参数或 stdin 管道，逐个 `httpGet` + `extractMarkdown`，输出 Markdown 到 stdout。

### 5.4 query 模式

调用 `plugin.search(ctx, keywords.join(' '), limit)`，输出 JSON 到 stdout。

### 5.5 退出码

| 码 | 含义 |
|---|---|
| 0 | 至少一源成功 |
| 2 | 参数错误 |
| 3 | 全部失败 |
| 4 | 总超时（10 分钟） |

---

## 6. MCP Server 模式

`npx tsx read.ts --mcp` 通过 `@modelcontextprotocol/sdk` 启动 stdio MCP server，暴露三个工具：

| 工具 | 对应模式 | 参数 |
|---|---|---|
| `list_news` | list | `sources: string, limit?: number` |
| `read_url` | detail | `urls: string[]`（1–10 个） |
| `search` | query | `source: string, query: string, limit?: number` |

工具内错误静默返回（不中断 server）；个别源失败不影响其他源。

---

## 7. Preset 与 Category

`read.ts` 内定义 `SETS` 常量：

```ts
const SETS = {
  news: ['bbc', 'nytimes', 'xinhua', 'thepaper'],
  tech: ['hn', 'ars', 'mittr', 'infoq'],
  fin:  ['caixin', 'yahoo', 'cnbc:markets'],
};
```

`-s reddit:ml,cnbc:ai` 语法：`id:category`；同一 id 多个 category 合并为一次 plugin 调用（`categories` 数组）。Plugin 内部根据 `categories` 决定抓哪个子 feed/频道。

---

## 8. 测试

- 每个 plugin：`test/plugins/{source}.test.ts`，离线 fixtures + 单测。
- `lib.ts` 各模块：`http.test.ts`、`extract.test.ts`、`writer.test.ts`、`logger.test.ts`。
- `read.ts`：`read.test.ts`，mock plugin 验证并发/错误隔离/退出码/模式推断。
- 框架：`node --test` + `c8` 覆盖率（目标 ≥75%）。

---

## 9. HTTP 请求 Profile

`lib.ts` 中定义 `PROFILES` 常量（`ProfileName` → `Profile`），每个 profile 包含 `ua` 和可选的 `headers` 覆盖。

```ts
export type ProfileName = 'default' | 'chrome-win' | 'firefox' | 'mobile' | 'curl';

export const PROFILES: Record<ProfileName, Profile> = {
  default:    { ua: 'Mozilla/5.0 (X11; Linux x86_64) ... Chrome/124 ...' },
  'chrome-win': { ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Chrome/124 ...' },
  firefox:    { ua: 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) ... Firefox/125.0' },
  mobile:     { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 ...) ... Safari/604.1' },
  curl:       { ua: 'curl/8.7.1', headers: { Accept: '*/*' } },
};
```

`_activeProfile` 为模块级变量，通过 `setActiveProfile(name)` 切换，`httpGet` 每次调用时调用 `buildDefaultHeaders()` 读取当前 profile 构造默认头部，再与 `opts.headers` 合并（opts 优先）。

CLI 新增 `-p` / `--profile` 选项（默认 `default`），在 `main()` 最早调用 `setActiveProfile(args.profile)`，令所有后续请求统一使用该 profile。

---

## 10. 已确认的关键决策

- 语言：TypeScript（`.ts`，运行 `tsx`，类型检查 `tsc --noEmit`）。
- 无 Playwright：所有源走 HTTP；原 reuters/cnbc-ai browser 插件已移除。
- 默认 stdout：list/detail/query 均输出到 stdout，`-o FILE` 可选落盘。
- `writeListJson` / `writeArticleMd` 保留，供外部集成（如需落盘）和单测覆盖。
- 文件名格式：`{source}-{NNNN}.md`（4 位序号），`index.json` 作为元数据汇总。
- MCP 工具名：`list_news`、`read_url`、`search`（与 CLI 模式一一对应）。
