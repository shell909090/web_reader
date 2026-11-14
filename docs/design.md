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
│   ├── ... (23 个)
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
  occurred_at?: string;   // 事件发生时间
  written_at?: string;    // 原文撰稿时间
  published_at?: string;  // 原文首次发布时间
  first_seen_at: string;  // 本系统首次成功取得该条新闻的时间
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

## 10. Polymarket Plugin

数据来源：Gamma API（`https://gamma-api.polymarket.com/markets`），公开无需鉴权。

请求参数：`limit={n}&closed=false&order=volumeNum&ascending=false`，按总成交量降序返回活跃市场。

字段映射：
- `title` ← `question`
- `url` ← `https://polymarket.com/event/{slug}`
- `notes` ← 三段拼接（` · ` 分隔）：`Yes: {p}%`（二选一市场），`Vol: $XM/$XK/$X`，`Ends: {endDateIso}`

无搜索接口（Gamma API 不提供关键词检索）。

---

## 11. 已确认的关键决策

- 语言：TypeScript（`.ts`，运行 `tsx`，类型检查 `tsc --noEmit`）。
- 无 Playwright：所有源走 HTTP；原 reuters/cnbc-ai browser 插件已移除。
- 默认 stdout：list/detail/query 均输出到 stdout，`-o FILE` 可选落盘。
- `writeListJson` / `writeArticleMd` 保留，供外部集成（如需落盘）和单测覆盖。
- 文件名格式：`{source}-{NNNN}.md`（4 位序号），`index.json` 作为元数据汇总。
- MCP 工具名：`list_news`、`read_url`、`search`（与 CLI 模式一一对应）。


## Yahoo Finance 页面抓取

`yahoo` 请求 `https://finance.yahoo.com/news/`，解析服务端渲染的 `data-testid="storyitem"` 新闻卡片标题链接，兼容旧新闻路径与新分类文章路径。仅保留财经站 HTTPS 文章，移除查询参数和锚点后去重。保留页面提供的摘要和发布信息；无绝对时间时不生成 `published_at`。非空请求解析不到文章时报错，避免页面变更被误报为成功。结果仅包含初始 HTML 中的新闻，不加载滚动分页。

共享 HTTP 客户端使用同一 npm Undici 版本的 fetch，每个请求跳转拥有独立 Agent，将每次响应头上限设为 64 KiB，不修改全局 dispatcher，CLI 和 MCP 共用；保持原有重定向和重试逻辑，生命周期与DNS取消见下文。为兼容 Node 20，使用 Undici 7.30.1+（7.x）及 jsdom 27.4.0+（27.x），保留安全更新。


## 工程质量门禁

Makefile 提供 `complexity`、`maintainability`、`coverage`、`security`、`quality`；默认目标是只读的 `all: build`。圈复杂度上限 9、认知复杂度上限 14、文件 MI 必须大于 30，与 ai-hitl 参考项目一致。MI 使用 TypeScript 编译器 AST 和词法扫描的近似计算，统计范围为 lib.ts、read.ts、src 和 plugins 下的 TypeScript 文件。

覆盖率检查包括未被加载的生产文件，四项总体阈值均为 51%，与参考项目一致；unittest 依赖 coverage，quality 不重复运行测试。Trivy 扫描 package-lock.json 的全部运行时和开发依赖，输出 JSON 并核对每个锁定包名和版本是否存在；缺失结果时失败。漏洞按严重度汇总，但不按漏洞数量阻断，与参考项目一致。没有 Go 二进制，因此不迁移 rootfs 扫描。


## 依赖升级兼容策略

依赖更新到 Node 20 兼容范围内的稳定安全版本，并刷新传递依赖到上游约束允许的最新版。TypeScript 暂用 6.0.x：最新 typescript-eslint 与 SonarJS 的 peer 范围均为 <6.1，MI 依赖旧编译器 API；暂不强制安装不兼容的 TypeScript 7。MCP 直接使用 zod，显式声明为运行时依赖。Node 支持 20.x ≥20.19.0、22.x ≥22.13.0 或 ≥24.0.0，打包目标为 node20。jsdom 保持 27.x，Undici 保持 7.x，类型定义分别保持 @types/jsdom 27.x、@types/node 20.x；保持依赖漏洞扫描清零，不要求依赖跨入不兼容的新主版本。


## 代码质量重构

`read.ts` 仅处理总超时、命令分派和进程入口，导出的 `main(argv: string[]): Promise<number>` 与 `startMcp(): Promise<void>` 不变。`lib.ts` 保持公共导出兼容，内部拆为 config、types、logger、output、extract 和 http 模块，避免插件需要批量更换依赖路径。

CLI 的参数解析、来源/分类合并、列表、详情和查询分别位于 src/cli。保持 -q 优先于 -s、详情模式从 stdin 读取 URL、部分来源/文章失败时继续输出成功项，以及原有退出码。插件加载器位于 src/plugin-loader.ts，以模块相对路径加载根目录 plugins；源代码与 dist 入口均可定位插件。

共用的 RSS 字段提取及 CNBC/MIT TR 新闻解析位于 src/feeds。collectFeedResults 只合并成功请求的条目，保持请求结果顺序及首次 URL 优先，并逐条记录失败。Bluesky、Reddit、Polymarket 的认证、字段转换和 Markdown 渲染按职责拆分，不改变输出字段和格式。

复杂度、MI、覆盖率均包含新增 src/**/*.ts，圈复杂度≤9、认知复杂度≤14、每文件 MI>30 的阈值不变。回归测试覆盖公共入口、预置合并、参数校验、部分失败、stdin、MCP 工具返回和并发控制。


## 维基新闻事件日期

`Item.event_date?: string` 仅用于列表，格式为合法日历日期 `YYYY-MM-DD`，不做时区换算，不代填 `published_at`；搜索结果不添加该字段。英文源取日容器的完整年月日 ID；中文源取新闻编辑链接中唯一明确的年月，与月日标题匹配，排除 redlink 创建链接。年月缺失、冲突、月份不匹配或日期无效时省略字段，不使用系统年份推测。非日期标题终止中文事件日期上下文，避免给其他栏目误标日期。


## 新闻时间统一契约

仅定义以下四个有业务意义的时间，不将更新时间、索引时间或市场结束时间混入。

| 字段 | 类型 | 含义与取值依据 |
|---|---|---|
| `occurred_at` | 可选字符串 | 新闻报道的事件发生时间；使用来源明确提供的事件时间，不从发布时间推定。多事件或时间范围无法确定单一时间时省略。 |
| `written_at` | 可选字符串 | 原文撰稿时间；仅使用来源明确标注的撰稿时间，不把更新时间、CMS创建时间或发布时间代入。 |
| `published_at` | 可选字符串 | 原文首次公开发布的时间；转载或社交分享时间不能替代被链接原文的发布时间。 |
| `first_seen_at` | 必填字符串 | 本系统首次成功解析并接收该新闻条目的时间，由系统记录，不来自上游；再次抓取、重试或内容更新不得覆盖。 |

### 格式和时区

- 四字段统一为 ISO 8601/RFC 3339 秒精度字符串：`YYYY-MM-DDTHH:mm:ss+08:00`，统一时区 `Asia/Shanghai`。例如 `2026-11-08T10:57:00+08:00`。不混用年月、日期、时间戳整数或不同偏移。
- 来源有明确偏移时，先按其偏移解释，再转换至统一时区；不得先截取日期。源明确精确到分钟时秒位规范化为 `00`；不输出毫秒。
- 来源无时区时，只有经确认并记录该来源时区才能转换，不能使用运行机器默认时区猜测。
- 仅有年月或日期，不足以确定时间点：不补零点、不伪造时间，相关字段省略；原始日期仍可保留在 `notes` 供阅读。如需将只有日期的信息用于机器筛选，需另行明确精度表示，不能悄悄补齐。
- 字段缺失使用省略，不用空字符串、`null`、零时间或当前抓取时间替代。`first_seen_at` 为系统自有记录，不受上游缺失影响。

### 首次看到的记录边界

- 按规范化新闻 URL 标识同一条新闻（不同来源指向相同原文应复用首次时间），需持久化记录，使跨进程、重启及重复抓取保持不变。
- 首次是本系统有记录以来的首次成功取得，不声称是全网首次；历史数据缺少记录时，从启用该机制后的首次成功获取开始记录，不倒推。
- 请求失败、解析失败或未形成有效条目时不登记。并发首次写入需保证只保存首次值。持久化失败应明确报错，不能默默生成每次都变化的“首次”时间。

### 验收规则及兼容边界

- 验证四字段语义隔离、跨时区跨日转换、来源无时区和仅日期时不伪造、分钟规范化、合法日历时间检查。
- 验证首次获取、重复获取、跨进程读取、并发及失败请求不会错误改写 `first_seen_at`。
- 维基 `event_date` 是日期精度，不能直接改名并补零点成为 `occurred_at`。


## 新闻时间实现

- 统一时间字段由 `src/timestamps.ts` 校验并转换为 `+08:00`；RSS 保留时分秒，错误或日期精度值不升级为时间点。插件内部的 `Item.first_seen_at` 可选，经过加载器包装后，CLI/MCP 列表与搜索的有效输出均包含此字段。
- `src/news-times.ts` 包装插件列表与搜索，在有效条目解析后先持久化首次观察，再补充缺失的发布时间。对需要详情元数据的源，每条额外请求一次，单源最多4个并发，每请求8秒超时（HTTP层原有重试仍生效）。失败时保留新闻和首次观察，省略发布时间并输出调试日志。已有精确发布时间的RSS源不额外请求正文。
- 元数据仅采用文章的 `datePublished`、明确的发布时间 meta 和已验证的源专用字段；不读取任意 `time`、评论日期、`dateModified`、`dateCreated` 作为发布时间或撰稿时间。多个发布时间冲突则省略。
- 新浪、人民网、财新、开源中国、新华网的本地发布时间按来源北京时间格式配置为 `+08:00`；其他来源无偏移时不推断。InfoQ 的 `publish_time` 为毫秒Unix时间。JSON-LD/RSS已有偏移优先按真实时刻转换。
- 首次观察记录使用Node内置SQLite，路径为 `$WEB_READER_DATA_DIR/first-seen.sqlite`；未设置时使用 `$XDG_DATA_HOME/web-reader/first-seen.sqlite`，再默认 `~/.local/share/web-reader/first-seen.sqlite`。URL移除片段、utm参数、fbclid/gclid并排序查询参数，保留影响文章身份的参数；不猜测短链和重定向等价关系。
- SQLite以URL为主键，事务内 `INSERT OR IGNORE` 和读取，竞争写入最多等待5秒，失败明确抛错；清理记录会重置后续首次观察，需按需备份。测试使用临时数据目录，不污染用户首次观察库。
- 事件与撰稿的准确时间缺少明确字段依据时省略；HF论文日、Polymarket结束日和社交索引/更新时间不填入四字段。维基 `event_date` 保留日期精度。

## HTTP 超时与可取消 DNS

每个重定向跳转的 `timeoutMs` 覆盖 DNS、连接、响应头及完整正文读取；计时器在正文完成或异常后清理。重定向上限和网络错误重试一次的规则不变。

`dns.lookup()` 虽然提供异步回调，底层仍在线程池中调用阻塞式系统 `getaddrinfo`。HTTP 取消不会中断已经运行的系统查询；重试成功后，Node 的退出清理仍可能等待旧查询线程。因此 HTTP 连接改用同一进程内的 `dns.promises.Resolver`（c-ares），通过 Promise 与事件循环调度，不创建独立进程或工作线程来执行 DNS。

- 每个解析操作拥有独立 Resolver；请求 AbortSignal 触发 `resolver.cancel()`，不会取消其他请求。解析完成后移除监听器并清理剩余查询。
- 每个 HTTP 跳转使用独立 Undici EnvHttpProxyAgent，直接连接及代理连接的 DNS 均绑定该跳转的取消信号；成功、失败、重定向均在 finally 中取消残留解析并销毁 Agent。避免旧连接尝试或重试后的查询存活到进程退出。代价是不再跨请求复用 HTTP 连接，可能增加 TLS 握手开销。
- IP 字面量直接使用；域名优先读取 hosts 文件（Linux `/etc/hosts`，Windows 系统 hosts 路径），支持大小写不敏感别名、注释、IPv4/IPv6 和去重。hosts 文件不存在时继续查询 DNS，其他读取错误显式传播。
- 外部域名使用当前 Node DNS 服务器配置，A/AAAA 并行查询；指定 family 时仅查询对应类型。任一类型有地址即可使用；两类都失败时返回解析错误。DNS 结果默认 IPv4 在前，可指定 IPv6 优先；本地 hosts 保留文件顺序。
- Resolver 的单次查询基础超时为 2 秒，每服务器最多尝试 2 次；这不是整个解析阶段的固定总时限，整个阶段仍受 HTTP 请求计时器控制。请求取消时真正取消 DNS I/O，而不是仅让 Promise 提前返回。
- 兼容边界：不走系统 NSS、mDNS、LDAP、搜索域补全或系统地址排序策略，不实现 `getaddrinfo` 的 ADDRCONFIG/V4MAPPED 标志。内网名称需要 hosts 显式配置或使用可直接解析的完整域名。不回退到 `dns.lookup()`，避免重新引入无法取消的系统查询。

验证要求：本地静默 DNS 下请求超时后进程及时退出；取消后重试可恢复；并发请求取消相互隔离；hosts、地址族、部分解析失败及正文停滞均有覆盖。Polymarket 在线提取需检查 JSON 内容和进程退出，不能将已有完整输出的进程超时简单归为上游失败。

DNS API依据：[Node.js DNS实现说明与Resolver取消接口](https://nodejs.org/api/dns.html#implementation-considerations)。


## 搜索扩展与可选配置

### 能力与结果

- 在现有插件结构中允许 `list` 缺省，`search` 独立存在；加载器提供统一能力信息，CLI 和 MCP 依能力分派。列表 `all` 及新闻预设只包含具备 `list` 的插件，显式调用不支持的能力时报错。
- 搜索插件 ID 为 `brave`、`duckduckgo`、`tavily`、`exa`、`parallel`、`firecrawl`、`keenable`、`wolframalpha`、`searxng`。Brave、Tavily、Exa、WolframAlpha 优先使用官方 API；网页搜索的接入路径须核实访问政策，不使用退役接口或把即时答案接口当作完整网页搜索。SearXNG 连接用户配置的实例。
- CLI 继续使用 `-q SOURCE`，MCP 继续使用 `search(source, query, limit?)`。共用能力判断与配置，不各自维护搜索源白名单。
- 搜索保持 JSON 数组输出，引入网页与知识答案的联合类型：网页结果保留现有 source、title、url、notes 字段，可附 summary、publisher、rank；source 表示搜索提供方，rank 表示上游的一基位置。知识答案包含 source、title、answer，可附结构化内容和来源，不要求 url 或新闻时间。使用类型判别字段区分两种结果。
- 搜索默认不调用新闻发布时间补全中的正文请求。有 URL 的结果保留首次观察契约；无 URL 的知识答案不进入新闻 URL 观察库。列表的时间补全行为不变，未知发布时间省略。

### 配置加载

- 使用 TOML，默认位置为 `$XDG_CONFIG_HOME/web_reader/config.toml`；XDG_CONFIG_HOME 未设置或为空时使用 `~/.config/web_reader/config.toml`。
- `--config PATH` 在 CLI 和 MCP 进程启动时选择替代文件，不与默认文件叠加。不自动读取工作目录配置或 `.env`。默认文件不存在按空配置处理；显式文件不存在、不可读或解析失败时报错，不回显秘密值。
- 独立配置模块统一解析并逐字段合并，优先级为环境变量 > 文件 > 默认值。仅在调用对应源时检查必需凭证，避免未配置的源阻止其他功能启动。
- 文件允许直接保存凭证，含秘密值时推荐权限为 `0600`；仓库只放占位示例。示例：

```toml
[providers.brave]
enabled = true
api_key = "replace-with-your-key"

[providers.searxng]
enabled = true
base_url = "https://search.example.com"
```

- 凭证映射为 `providers.brave.api_key` / `BRAVE_API_KEY`、`providers.tavily.api_key` / `TAVILY_API_KEY`、`providers.exa.api_key` / `EXA_API_KEY`、`providers.wolframalpha.app_id` / `WOLFRAMALPHA_APP_ID`。
- 提供方的 enabled 映射为 `<ID>_ENABLED`，支持配置的 base_url 映射为 `<ID>_BASE_URL`（ID 大写，例如 SEARXNG_BASE_URL）。其他适配器若需要凭证，同样提供文件字段与环境变量两种入口。
- 未设置的环境变量不覆盖文件；显式空凭证视为未配置，不回退到文件旧值。布尔值、地址及字段类型需校验。

### 请求边界与验证

- 各适配器按服务协议携带认证头或参数，公共 HTTP 层不配置全局 key；支持官方 API 所需的请求方法和 JSON 请求体，并保留超时与取消机制。
- 带凭证请求的跨 origin 重定向默认拒绝，避免头、URL 或请求体泄漏。读取结果网页使用独立请求，不继承搜索凭证。
- 正常与调试日志均脱敏，不直接输出认证头、含凭证 URL、请求体或未经处理的上游错误。401/403 不一概解释为缺少 key；验证码与 429 分别报告，保持 4xx 不自动重试，并识别服务方等待要求。
- 不利用 HTTP profile、代理、身份或端点切换绕过拒绝。解析错误页不能返回成功空数组。
- 离线测试覆盖能力分派、输出兼容、配置两种独立入口、逐字段覆盖、XDG 回退、显式配置路径、缺失或损坏文件、凭证隔离、受阻响应与知识答案。不以绕过限制为通过条件。
- CLI 帮助、MCP schema 及中英文 README 保持一致，说明支持能力和访问限制。

### 搜索实现

配置解析使用 smol-toml 和 Zod，配置结构与解析逻辑分别位于 `src/search/config-schema.ts`、`src/search/config.ts`。现有新闻插件使用 FeedPlugin 保持列表类型约束；Plugin 允许独立搜索能力。搜索请求复用公共 HTTP 层，支持 POST，并拒绝携带搜索上下文的跨 origin 重定向。

公共 HTTP 客户端通过 Undici EnvHttpProxyAgent 读取 HTTP_PROXY、HTTPS_PROXY、NO_PROXY 及其小写形式，小写优先。HTTPS_PROXY 未设置时使用 HTTP_PROXY，无代理时直连；代理失败不回退直连。


### 免 key 搜索接入

- Exa 未配置 api_key 时通过 `web_search_exa` 调用官方远程 MCP；配置 key 时保持 REST `/search` 路径。Parallel 调用 `web_search`；Firecrawl 调用 `firecrawl_search`，仅请求 web，关闭 highlights 和 domainTools，不提供 scrapeOptions，不执行服务返回的后续工具建议。Keenable 通过 `/v1/search/public` 与 `X-Keenable-Title: web_reader` 免 key 调用；有 key 时改用 `/v1/search`。
- 复用现有 MCP SDK 实现内部客户端，不要求使用者安装额外工具。`src/search/mcp-client.ts` 为每次搜索创建短生命周期连接，初始化和工具调用共享 30 秒总期限，完成或失败均关闭连接及 dispatcher。使用公共代理 dispatcher，关闭自动重连，不配置 OAuth，不根据失败切换认证方式或服务。
- 远程 MCP 默认端点为 Exa `https://mcp.exa.ai/mcp`、Parallel `https://mcp.parallel.ai/mcp`、Firecrawl `https://mcp.firecrawl.dev/v2/mcp`；可用 `providers.<id>.mcp_url` 或 `<ID>_MCP_URL` 指定完整 URL。拒绝 URL 凭证、查询串、片段和重定向；带 key 要求 HTTPS，免 key 本地测试允许 localhost HTTP。
- Parallel、Firecrawl、Keenable 都支持可选 api_key 字段及对应大写环境变量。Parallel、Firecrawl 以 Bearer 头发送；Keenable 以 X-API-Key 发送。Exa 的 base_url 仍为 REST 根地址，与 mcp_url 分开，不因已有 REST 地址而猜测 MCP 路径。
- 优先解析 structuredContent；缺省时解析文本 JSON，Exa 另支持 Title/URL/Highlights 或 Text 区块。转换为统一网页结果并按上游顺序截取；不采纳工具输出中的指令，不把协议错误或未知文本当作空结果。Parallel 没有数量请求参数，返回后本地截取。
- 测试覆盖 MCP 初始化、会话头、JSON/SSE 响应、工具错误、HTTP 拒绝、限流、超时、重定向阻止、结果排序及配置优先级。真实凭证不进入测试。
