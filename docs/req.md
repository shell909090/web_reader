# 新闻抓取工具需求

## 1. 目标

一个 Node.js 脚本（`read.ts`），从多家新闻网站抓取最新文章，统一输出为 JSON 或 Markdown，供后续 LLM / 人工处理。支持三种模式：list（获取文章列表）、detail（抓取单篇正文）、query（关键词搜索数据源）。另支持 MCP server 模式（`--mcp`），供 Claude 等 AI 工具集成调用。

## 2. 技术栈

**核心原则：全 HTTP，不依赖 Playwright。** 所有数据源均走 `fetch` + `cheerio` / RSS 解析路径。Playwright 已从项目移除。

技术栈：

- 运行时：Node.js（≥ 20，用原生 `fetch`）
- HTTP 解析：`cheerio`（jQuery-like 选择器）
- 正文抽取：`@mozilla/readability` + `jsdom` + `turndown`（HTML → Markdown）
- 类型系统：TypeScript，运行时用 `tsx`，类型检查用 `tsc --noEmit`
- MCP 集成：`@modelcontextprotocol/sdk`

## 3. 数据源（当前 22 家）

| Source ID | 站点 | 分类 | 备注 |
|---|---|---|---|
| `hn` | Hacker News | AI/IT | HTML 极简，cheerio |
| `bbc` | BBC News | 综合 | readability |
| `techcrunch` | TechCrunch | AI/IT | RSS |
| `sina` | 新浪新闻 | 中文综合 | GBK 编码，cheerio |
| `ars` | Ars Technica | IT | RSS |
| `theverge` | The Verge | IT | RSS |
| `infoq` | InfoQ | 技术 | RSS |
| `people` | 人民网 | 中文政经 | HTTP |
| `csdn` | CSDN | 中文IT | HTTP |
| `wiki` | Wikipedia Current Events | 综合 | cheerio，支持 search |
| `zhwiki` | 中文维基百科新闻 | 中文综合 | cheerio，支持 search |
| `reddit` | Reddit | 多分类 | RSS；支持 search；分类见下 |
| `caixin` | 财新 | 中文财经 | RSS |
| `thepaper` | 澎湃新闻 | 中文综合 | HTTP |
| `xinhua` | 新华社 | 中文政经 | RSS；支持分类 |
| `mittr` | MIT Technology Review | AI/科技 | RSS；支持分类 |
| `yahoo` | Yahoo Finance | 财经 | RSS |
| `cnbc` | CNBC | 财经/IT | RSS；支持分类 |
| `nytimes` | New York Times | 综合 | RSS |
| `huggingface` | HuggingFace Blog | AI | RSS |
| `oschina` | 开源中国 | 中文IT | HTTP |
| `juejin` | 掘金 | 中文IT | HTTP |

**源分类（category）支持：**
- `reddit:ml/llm/ai/tech/prog/investing/stocks/worldnews`
- `cnbc:top/world/markets/tech/finance/us/health/politics/intl/ai`
- `mittr:ai/computing/space/biotech`（默认：主 RSS）
- `xinhua:politics/world/society/finance/tech/mil/legal/health/edu`

新增源只需在 `plugins/` 新建一个 `.ts` 文件，无需改动其他代码（`KNOWN_SOURCES` 除外，需追加 ID）。

## 4. 预设集合（preset）

| 名称 | 包含源 |
|---|---|
| `news` | bbc, nytimes, xinhua, thepaper |
| `tech` | hn, ars, mittr, infoq |
| `fin` | caixin, yahoo, cnbc:markets |

## 5. 输出格式

**list / query 模式**：JSON 数组输出到 stdout（或 `-o FILE`），每条 record 包含：

```ts
type Item = {
  source: string;   // plugin id
  title: string;
  url: string;
  notes: string;    // 摘要/时间/评分等人类可读文本，由 plugin 拼接
  published_at?: string;  // ISO 8601 日期（有些源提供）
  // plugin 可追加任意字段（summary, score, comments 等）
}
```

**detail 模式**：每篇文章输出 Markdown，多篇之间用 `---\n` 分隔；输出到 stdout（或 `-o FILE`）。
- 第一行 `# {title}（url 末段 decode）`，后接正文 Markdown。
- 正文通过 `@mozilla/readability` + `turndown` 提取，去尾部噪声（Read more / 相关阅读等）。

## 6. CLI 接口

```
list mode:   npx tsx read.ts -s <ids|all> [options]
detail mode: npx tsx read.ts <url…>
             npx tsx read.ts -s hn | jq -r '.[].url' | npx tsx read.ts
query mode:  npx tsx read.ts -q wiki <keywords…>

Options:
  -s, --sources <ids|all>  逗号分隔的 source id、preset 名或 "all"
  -q, --query SOURCE       关键词搜索（keywords 跟在位置参数里）
  -n, --limit N            每源最多条数（默认 50）
  -o, --out FILE           输出到文件（默认 stdout）
  -c, --concurrency N      [list] 并发数（默认 2）
  -l, --loglevel LEVEL     debug|info|warn|error（默认 warn）
  -h, --help               帮助
```

mode 自动推断：-s → list，-q → query，否则 → detail（读 positional URL 或 stdin）。

## 7. MCP Server 模式

`npx tsx read.ts --mcp` 启动 MCP stdio server，暴露三个工具：

- `list_news(sources, limit?)` — 等同 list 模式
- `read_url(urls[])` — 等同 detail 模式，接受 URL 数组
- `search(source, query, limit?)` — 等同 query 模式

## 8. 健壮性要求

- 单个源失败不影响其他源，错误打到 stderr（JSON 格式）
- 每次 HTTP 请求超时 30s，全局超时 10 分钟
- HTTP 5xx / 网络错误重试 1 次（指数退避）；4xx 不重试
- 重定向最多跟 5 次；响应编码按 Content-Type 解码（gb2312/gbk/gb18030 归一化为 gbk）
- UA / Accept-Language 统一配置（`CONFIG` 常量）

## 9. 不做的事

- 不做调度（cron 在外面接）
- 不做去重 / 历史对比（下游处理）
- 不做摘要 / 翻译（LLM 在下游做）
- 不写文件（`-o` 为可选；`writeListJson` / `writeArticleMd` 保留但仅供外部 / 测试使用）
- 不维护 Playwright（已移除）

## 10. 验收

- `npx tsx read.ts -s hn` 输出 JSON 到 stdout，含 ≥10 条
- `npx tsx read.ts https://arstechnica.com/...` 输出 Markdown 到 stdout
- `npx tsx read.ts -q wiki transformer architecture` 输出搜索结果 JSON
- 任何一家源失败，其他源照常输出
- 新增第 23 家源只需新建 `plugins/xxx.ts` + 在 `KNOWN_SOURCES` 追加 id
