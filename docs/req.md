# 新闻数据流抓取、搜索与网页阅读工具需求

## 1. 目标

一个 Node.js 脚本（`read.ts`），提供新闻数据流抓取、搜索和网页阅读三项独立且可组合的功能，统一输出为 JSON 或 Markdown，供后续 LLM / 人工处理。支持三种模式：list（获取文章列表）、detail（抓取单篇正文）、query（关键词搜索数据源）。另支持 MCP server 模式（`--mcp`），供 Claude 等 AI 工具集成调用。

## 2. 技术栈

**核心原则：全 HTTP，不依赖 Playwright。** 所有数据源均走 `fetch` + `cheerio` / RSS 解析路径。Playwright 已从项目移除。

技术栈：

- 运行时：Node.js（≥ 20，用原生 `fetch`）
- HTTP 解析：`cheerio`（jQuery-like 选择器）
- 正文抽取：`@mozilla/readability` + `jsdom` + `turndown`（HTML → Markdown）
- 类型系统：TypeScript，运行时用 `tsx`，类型检查用 `tsc --noEmit`
- MCP 集成：`@modelcontextprotocol/sdk`

## 3. 数据源

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
  -n, --limit N            列表每源最多条数；搜索最终最多条数（默认 50）
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
- 不做新闻列表去重 / 历史对比（下游处理）；搜索 `all` 的跨供应商 URL 去重除外
- 不做摘要 / 翻译（LLM 在下游做）
- 不写文件（`-o` 为可选；`writeListJson` / `writeArticleMd` 保留但仅供外部 / 测试使用）
- 不维护 Playwright（已移除）

## 10. 验收

- `npx tsx read.ts -s hn` 输出 JSON 到 stdout，含 ≥10 条
- `npx tsx read.ts https://arstechnica.com/...` 输出 Markdown 到 stdout
- `npx tsx read.ts -q wiki transformer architecture` 输出搜索结果 JSON
- 任何一家源失败，其他源照常输出
- 新增第 23 家源只需新建 `plugins/xxx.ts` + 在 `KNOWN_SOURCES` 追加 id


## 11. 搜索功能

- 支持 Brave、DuckDuckGo、Tavily、Exa、Baidu、Bing、Sogou 普通网页搜索、WolframAlpha 和 SearXNG；维持现有垂直搜索能力。
- 数据源可以仅提供搜索，不要求具备新闻列表能力；获取全部新闻来源或使用新闻预设时，不包含仅搜索的数据源。
- 用户指定搜索来源和关键词，可限制返回数量。指定单一来源时保留上游顺序，不统一按时间排序，也不自动切换服务；`any` 和 `all` 按下述规则选择或合并供应商。
- 网页结果区分搜索提供方和内容发布方，提供标题、链接、摘要（若有）和排名。WolframAlpha 的计算／知识结果允许包含答案、表格、公式和来源，不强制填充网页链接或新闻时间。
- 搜索成功与全文可读分别判断；搜索默认不逐条读取结果页面补正文或时间，不伪造缺失信息。SearXNG 支持用户指定实例。
- 命令行与 MCP 提供一致的搜索行为。不支持的操作、缺少配置、访问受限、限流、解析失败和有效空结果应明确区分。
- 优先使用正式接口，遵守网站访问政策。网站明确反对自动访问时，可保留适配能力，但不默认启用被禁止的访问路径；遇到拒绝、验证码或限流，不破解验证、不轮换身份或代理、不切换端点规避限制，并尊重服务方等待要求。
- 文档说明支持能力与访问限制；不保证外部服务持续可用，不以突破限制作为验收条件。

### 通用搜索选择：any 与 all

- `-q any` 和 `-q all` 仅用于通用网页搜索供应商，不包含 wiki、zhwiki、新闻源内部搜索或 WolframAlpha 等百科、垂直与计算／知识服务；这些来源仍需显式指定。MCP 的 `search` 提供相同选择。
- 候选来源必须启用且满足配置条件：免 key 服务无需凭证，需要 key 或实例地址的服务须具有相应配置。“可用”不代表已经探测成功；不为选择候选额外发送联网探测请求。
- `any` 随机选择一家候选供应商。遇到网络故障、服务不可用或额度不足时尝试其他候选，不重复选择同一供应商；有效空结果也是成功，立即返回。没有候选或全部失败时明确报错。
- `all` 调用全部候选供应商，按各自排名交错合并结果，按 URL 去重并保留来源信息，不比较不同供应商的相关性分数。部分失败时返回成功结果并报告失败；全部失败时明确报错。供应商成功返回空结果不算失败。
- `-n` 和 MCP 的 `limit` 表示搜索最终最多返回的条数，去重后不保证填满。选择 `any` 或 `all` 允许调用已配置的收费供应商；禁用的供应商不得参与。
- 聚合选择不改变访问边界：不得绕过验证码、站点拒绝或限流，不对受限供应商连续重试，也不切换其身份或端点规避限制。

## 12. 可选配置与凭证

- 环境变量和配置文件均可独立完成服务配置；配置文件允许直接填写凭证，不要求引用环境变量。按字段采用环境变量、配置文件、内置默认值的优先级。
- 默认从用户级配置位置读取可选文件，也允许显式指定替代文件。不自动发现工作目录配置；默认文件缺失不影响运行，显式文件缺失、不可读或格式错误应报错。
- 支持设置来源启用状态、凭证和服务地址。某源缺少配置不阻止启动或其他功能使用，在调用该源时明确提示；禁用源不得被调用。
- 命令行与 MCP 使用相同配置规则，不要求通过命令行参数或工具调用参数传入凭证。
- 凭证仅用于对应服务，不传给搜索结果页面或其他站点，不出现在结果、日志、错误和调试输出中；真实凭证不纳入版本控制。

## 13. 搜索与配置验收

- 仅搜索源可独立查询，不进入新闻列表；网页结果保留上游顺序，知识答案不被强制转换为新闻条目。
- 仅环境变量、仅配置文件及两者混合使用均符合配置规则；覆盖文件缺失、配置无效、缺少凭证和禁用源的行为，命令行与 MCP 一致。
- 搜索不额外读取结果页面；受阻、限流及空结果可区分，不触发突破限制的行为，凭证不泄漏到后续阅读、其他站点或输出。

- `any` / `all` 验收覆盖候选过滤、无额外探测、随机选择不重复、失败切换、有效空结果、全部失败、部分失败、交错合并、URL 去重、来源保留及最终数量上限；CLI 与 MCP 行为一致。
