# web_reader

Node.js 新闻抓取与网页阅读工具，支持获取新闻列表、抓取全文 Markdown、搜索网页和参考资料，以及 MCP server 模式供 AI agent 集成。

> [English](README.md)

## 功能特点

- **25 个数据源**，涵盖中英文——详见下表
- **三个预置组合**：`news`（综合）、`tech`（科技）、`fin`（财经）
- **三种模式**：list（新闻列表）· detail（抓全文）· query（搜索）
- **MCP server 模式**，供 AI agent 调用（`--mcp`）
- **纯 HTTP**：无浏览器依赖
- **GB2312/GBK 支持**：中文源编码自动处理

## 数据源

| ID | 网站 | 语言 | 搜索 | 全文 | 备注 |
|---|---|---|---|---|---|
| `hn` | Hacker News | 英文 | ❌ | ✅ | 含评分和评论数；列表项均为外链文章 |
| `bbc` | BBC News | 英文 | ❌ | ✅ | |
| `techcrunch` | TechCrunch | 英文 | ❌ | ✅ | |
| `ars` | Ars Technica | 英文 | ❌ | ✅ | 含 `summary` 字段 |
| `theverge` | The Verge（AI 版块）| 英文 | ❌ | ✅ | Atom feed |
| `mittr` | MIT Technology Review | 英文 | ❌ | ✅ | 分类：ai computing space biotech |
| `wiki` | Wikipedia 时事 | 英文 | ✅ | ✅ | 含 `summary` 字段 |
| `zhwiki` | 中文维基百科新闻动态 | 中文 | ✅ | ✅ | 含 `summary` 字段 |
| `reddit` | Reddit | 英文 | ❌ | ⚠️ | 列表和搜索受访问限制，可能返回 429；讨论页可能返回 403。条目可能为外链或 discussion 讨论帖，外链正文取决于发布方。 |
| `yahoo` | Yahoo Finance | 英文 | ❌ | ✅ | HTML 新闻列表，条数随页面变化 |
| `gnews` | Google News | 英文 | ✅ | ⚠️ | 分类：tech business science health sports entertainment world nation；文章链接为 JS 跳转，需直接访问发布方页面 |
| `cnbc` | CNBC | 英文 | ❌ | ✅ | 分类：top world markets tech finance us health politics intl ai |
| `nytimes` | 纽约时报中文网 | 中文 | ❌ | ✅ | 全文可读 |
| `xinhua` | 新华社 | 中文 | ❌ | ✅ | 分类：politics world society finance tech mil legal health edu |
| `thepaper` | 澎湃新闻 | 中文 | ❌ | ✅ | 国内突发新闻 |
| `caixin` | 财新 | 中文 | ❌ | ⚠️ | 可能只返回订阅预览，不保证全文完整。 |
| `sina` | 新浪新闻 | 中文 | ❌ | ✅ | GB2312 自动转码 |
| `infoq` | InfoQ 中文 | 中文 | ❌ | ✅ | |
| `people` | 人民网 | 中文 | ❌ | ✅ | 按首页顺序获取，排除明确隐藏区块；不保证按发布时间排序。 |
| `hf` | HuggingFace Papers | 英文 | ✅ | ✅ | 每日 ML 论文 |
| `csdn` | CSDN | 中文 | ❌ | ❌ | 列表与正文的访问限制不同；正文返回 HTTP 521 时无法取得内容或发布时间。 |
| `oschina` | 开源中国 | 中文 | ❌ | ✅ | 通过 API 读取正文；外链跳转条目需直接读取原站 URL。 |
| `juejin` | 稀土掘金 | 中文 | ❌ | ✅ | |
| `bsky` | Bluesky | 英文 | ❌ | ⚠️ | news/tech 列表与搜索的访问限制不同；搜索可能返回 403，配置凭证不保证可用。外链正文取决于发布方，纯文字帖链接到社区页。 |
| `polymarket` | Polymarket 预测市场 | 英文 | ❌ | ✅ | 按成交量排名的热门预测市场；全文通过 Gamma API 渲染 |

### 访问限制

本工具不绕过登录、付费墙、验证码或站点的自动访问限制。新闻列表可读不代表链接文章可读；成功返回内容也不保证全文完整。表中 ✅ 表示支持该功能，⚠️ 表示部分可用或完整性未确认，❌ 的具体原因见备注。

403 本身不能证明缺少认证，配置凭证也不保证能够访问。各来源的限制和错误处理见 [信息源访问说明](docs/source-access.md)。

正文请求遇到非成功状态时会报错，不把拒绝页面当作文章。Google News 的部分链接需要直接使用发布方网址；财新可能只返回预览。搜索方式和配置要求见下面的独立表格。

## 搜索来源与配置

使用 `web_reader -q SOURCE "关键词" -n 5` 搜索。下列来源仅提供搜索，不加入新闻列表 `-s all` 或新闻预设。已有 wiki、zhwiki、reddit、gnews、hf、bsky 的搜索入口继续保留；其中 Reddit 和 Bluesky 有访问限制，见上文。

| SOURCE | 凭证或配置 | 搜索方式 |
|---|---|---|
| `brave` | Brave Search API key | Brave 网页搜索 API |
| `tavily` | Tavily API key | Tavily 搜索 API |
| `exa` | 无；API key 可选 | 免 key 使用远程 MCP；配置 key 后使用 REST API |
| `parallel` | 无；API key 可选 | 远程 MCP 网页搜索 |
| `firecrawl` | 无；API key 可选 | 远程 MCP 网页搜索 |
| `keenable` | 无；API key 可选 | 免 key 公共 HTTP 接口；配置 key 后使用认证接口 |
| `wolframalpha` | Full Results API AppID | 返回计算／知识答案 |
| `duckduckgo` | 无 | HTML 网页搜索 |
| `searxng` | 实例地址，实例需启用 JSON | 配置实例的 JSON 搜索接口 |


### 无需 key 的搜索

Exa、Parallel、Firecrawl、Keenable 不需要创建配置文件、注册账户或安装额外客户端即可查询：

```bash
web_reader -q exa "TypeScript documentation" -n 5
web_reader -q parallel "TypeScript documentation" -n 5
web_reader -q firecrawl "TypeScript documentation" -n 5
web_reader -q keenable "TypeScript documentation" -n 5
```

未配置 key 时使用服务方的公共额度，可能受到限流。配置该来源的 `api_key` 或对应环境变量后，调用会使用该凭证，额度及计费按服务方账户规则执行；失败或限流时不会自动切换认证方式、端点或其他来源。程序只执行搜索，不追加正文抓取或研究任务。

### HTTP 代理

CLI 和 MCP 的所有公共 HTTP 请求均读取代理环境变量，无需修改配置文件：

```bash
export HTTP_PROXY='http://PROXY_HOST:PROXY_PORT'
export HTTPS_PROXY='http://PROXY_HOST:PROXY_PORT'
export NO_PROXY='localhost,127.0.0.1'
web_reader -q duckduckgo "TypeScript documentation" -n 5
```

将示例地址替换为自己的代理地址。`HTTP_PROXY` 用于 HTTP 目标，`HTTPS_PROXY` 用于 HTTPS 目标；未设置后者时，HTTPS 请求也使用 HTTP_PROXY。这里的变量名表示目标网站协议，HTTPS_PROXY 的值可以是 HTTP 代理地址。

支持小写 `http_proxy`、`https_proxy`、`no_proxy`；同名大小写同时设置时，小写优先。`NO_PROXY` 用逗号分隔免代理主机或域名，可附端口；`*` 表示全部直连。没有代理配置时直接连接，不会自动寻找代理。代理连接失败会报错，不自动切换为直连。

MCP 读取启动进程的环境变量；通过客户端启动时，在客户端的 MCP 环境配置中设置这些变量。代理支持不会改变超时、访问限制和搜索凭证隔离规则。

### 申请凭证

- [Brave Search API](https://api-dashboard.search.brave.com/)：注册并获取 Search API key。
- [Tavily](https://app.tavily.com/)：获取 API key。
- [Exa](https://dashboard.exa.ai/)：可选申请 API key。
- [Parallel](https://platform.parallel.ai/)、[Firecrawl](https://www.firecrawl.dev/app/api-keys)、[Keenable](https://app.keenable.ai/)：可选注册账户并申请 API key。
- [WolframAlpha](https://developer.wolframalpha.com/)：创建应用取得 AppID，并确认可使用 Full Results API。

账户是否收费、额度及服务权限由提供方决定。本工具不会自动创建账户、购买服务或切换到另一个收费来源。

### 方式一：配置文件

默认文件为 `$XDG_CONFIG_HOME/web_reader/config.toml`；未设置 XDG_CONFIG_HOME 时为 `~/.config/web_reader/config.toml`。文件可不存在，仅使用无需配置的来源时不必创建。

按需填写以下区块。无需 key 使用的来源可以整个省略；不要填写占位 key，否则程序会把它当作真实凭证发送。示例地址和凭证必须替换为自己的值。

```toml
[providers.brave]
api_key = "your-brave-key"

[providers.tavily]
api_key = "your-tavily-key"

[providers.exa]
api_key = "your-exa-key"

[providers.wolframalpha]
app_id = "your-wolframalpha-app-id"

[providers.searxng]
base_url = "https://search.example.com"
```

不需要同时设置环境变量。推荐文件权限为 `0600`，不要把真实配置提交到 git。每个来源都可增加 `enabled = false` 来禁用。

指定其他文件：

```bash
web_reader --config /path/to/config.toml -q brave "TypeScript documentation" -n 5
web_reader --config /path/to/config.toml --mcp
```

显式文件替代默认文件；文件不存在或格式错误会报错。程序不自动加载当前目录的配置或 `.env`。

可选凭证的配置字段与环境变量对应如下，任选一种即可：

| 来源 | TOML 字段 | 环境变量 |
|---|---|---|
| Exa | `providers.exa.api_key` | `EXA_API_KEY` |
| Parallel | `providers.parallel.api_key` | `PARALLEL_API_KEY` |
| Firecrawl | `providers.firecrawl.api_key` | `FIRECRAWL_API_KEY` |
| Keenable | `providers.keenable.api_key` | `KEENABLE_API_KEY` |

### 方式二：环境变量

可以完全不创建配置文件，直接设置需要的变量：

```bash
export BRAVE_API_KEY='your-brave-key'
export TAVILY_API_KEY='your-tavily-key'
export EXA_API_KEY='your-exa-key'
export WOLFRAMALPHA_APP_ID='your-wolframalpha-app-id'
export SEARXNG_BASE_URL='https://search.example.com'
web_reader -q brave "TypeScript documentation" -n 5
```

两种方式同时存在时，环境变量逐字段覆盖配置文件，其余字段仍来自文件。空凭证环境变量会覆盖文件中的凭证，不回退到旧值；可免 key 的来源使用公共入口，必须有凭证的来源报告未配置。`<SOURCE>_ENABLED` 接受 `true` 或 `false`，例如 `BRAVE_ENABLED=false`。

REST API 来源可选用 `base_url`（或大写来源名加 `_BASE_URL`）指定受信任的 API 根地址，必须使用 HTTPS；路径由适配器追加。默认根地址是 Brave 的 `https://api.search.brave.com`、Tavily 的 `https://api.tavily.com`、Exa 的 `https://api.exa.ai`、WolframAlpha 的 `https://api.wolframalpha.com` 和 Keenable 的 `https://api.keenable.ai`。这项设置会改变凭证的接收方，不用于绕过拒绝。DuckDuckGo 不使用自定义地址。

Exa 的免 key 路径、Parallel 和 Firecrawl 使用内置远程 MCP 接入，无需配置外部 MCP 客户端。需要指定受信任的服务地址时，使用对应来源的 `mcp_url` 或 `<SOURCE>_MCP_URL`，值是完整端点 URL。默认分别为 `https://mcp.exa.ai/mcp`、`https://mcp.parallel.ai/mcp`、`https://mcp.firecrawl.dev/v2/mcp`。带凭证时必须使用 HTTPS；免 key 的本地服务可使用 localhost HTTP。Exa 配置 key 时走 REST API，其 `base_url` 只对带 key 路径生效。

SearXNG 的 `base_url` 是实例根地址，可包含部署子路径；允许 HTTP 以便连接本地实例。需要实例管理员在 `search.formats` 中启用 `json`。程序不会寻找或轮换公共实例。

### 结果与错误

网页结果是 JSON 数组，保留上游顺序。新增来源返回 `kind: "web"`、`source`、`title`、`url`、`rank`，有摘要时包含 `summary`；`source` 是搜索引擎，不是文章发布方。WolframAlpha 返回 `kind: "answer"`、`answer` 和 `sections`，不伪造文章链接或时间。

`-n` 是结果上限，不保证条数：Brave/Tavily 单次最多 20 条，Exa、Firecrawl、Keenable 最多请求 100 条；Parallel 不提供结果数量请求参数，程序按 `-n` 截取。所有来源均不自动翻页。WolframAlpha 返回一个包含多个内容区块的答案。搜索不会额外打开结果网页，阅读时请另行传入 URL。

未配置凭证只影响该来源；其他来源仍可使用。缺少配置、禁用、网络错误、拒绝访问和限流会明确报告，不作为空结果返回。凭证不会传给结果页面，跨站重定向被拒绝；日志不打印凭证。

## 环境要求

- Node.js ≥26.0.0
- npm

## 安装

```bash
npm ci
make install   # 通过 npm link 将 web_reader 安装为全局命令
```

`make install` 同时将 `web_reader/` 链接到 `~/.claude/skills/web-reader` 和 `~/.agents/skills/web-reader`；Codex 使用共享的 `.agents/skills` 目录。只安装技能链接可运行 `make install-skill`。正确的已有链接会保留，冲突文件不会被覆盖。若 `~/.codex/skills/web-reader` 或 OpenCode 专用技能目录存在旧安装，会提示迁移但不自动删除；旧安装需自行清理，以免重复加载。安装不会清理项目数据。


安装后可在任意目录使用 `web_reader` 命令。

已有安装可在仓库中执行 `git pull` 和 `npm ci`，按锁文件同步依赖。nvm 不是必需条件；使用 nvm 时，`.nvmrc` 选择 Node 26。

## 使用方法

模式推断规则：`-s` → list，`-q` → query，否则 → detail。

```bash
# 列表模式——抓取新闻，输出 JSON 到 stdout
web_reader -s news                       # bbc + nytimes + xinhua + thepaper
web_reader -s tech                       # hn + ars + mittr + infoq
web_reader -s fin                        # caixin + yahoo + cnbc:markets
web_reader -s cnbc:markets,cnbc:tech -n 30
web_reader -s fin -o fin.json            # 写入文件

# 详情模式——抓取指定 URL 全文（Markdown 输出）
web_reader https://arstechnica.com/...
web_reader -o article.md https://...

# 管道：列表 → 挑选 URL → 读全文
web_reader -s hn -n 5 | jq -r '.[].url' | web_reader
web_reader -s tech | jq -r '.[].url' | web_reader -o articles.md

# 查询模式——检索参考资料
web_reader -q wiki transformer architecture
web_reader -q zhwiki 注意力机制
web_reader -q reddit "open source LLM"
web_reader -q wiki attention mechanism | jq -r '.[0].url' | web_reader
```

### 参数说明

| 短参数 | 长参数 | 默认值 | 说明 |
|--------|--------|--------|------|
| `-s` | `--sources` | — | 数据源 ID、预置名（`news`/`tech`/`fin`）或 `all` |
| — | `--config` | — | 指定替代 TOML 配置文件，CLI / MCP 共用 |
| `-q` | `--query` | — | 搜索来源 ID（见上表），关键词跟在后面 |
| `-n` | `--limit` | `50` | 最大结果数 |
| `-o` | `--out` | stdout | 输出到文件 |
| `-c` | `--concurrency` | `2` | 并发数（list 模式）|
| `-l` | `--loglevel` | `warn` | `debug\|info\|warn\|error` |
| `-h` | `--help` | | 显示帮助 |


HTTP 响应头上限为每次响应 64 KiB（含重定向），由 `src/config.ts` 中的 `CONFIG.HTTP_MAX_HEADER_SIZE` 配置。

## MCP Server（AI agent 集成）

```bash
web_reader --mcp   # 以 MCP server 模式启动
```

在 `.claude/settings.json` 中配置：
```json
{
  "mcpServers": {
    "web_reader": {
      "command": "web_reader",
      "args": ["--mcp"]
    }
  }
}
```

暴露三个工具：`list_news`、`read_url`、`search`。详细 AI 使用说明见 `web_reader/SKILL.md`。

## 输出格式

新闻列表及含 URL 的搜索结果提供 `first_seen_at`，并在可确认时提供 `published_at`；`occurred_at`（事件时间）、`written_at`（撰稿时间）无明确依据时省略。四字段统一为 `YYYY-MM-DDTHH:mm:ss+08:00`（北京时间），仅有日期不补零点，更新时间和转发时间不冒充原文发布时间。维基原有 `event_date` 暂保留兼容。

首次观察按规范化 URL 保存于 `~/.local/share/web-reader/first-seen.sqlite`，支持 `XDG_DATA_HOME` 或 `WEB_READER_DATA_DIR` 自定义目录；跨进程和重复抓取保持首次值。该目录需可写；删除数据库会重置观察历史，请按需备份。缺少列表发布时间的部分源会额外请求文章元数据，耗时随条数增加；失败时保留条目、略去发布时间。逐源支持与实测限制见 [日期支持说明](docs/date-support.md)。


维基新闻列表可提供 `event_date`（YYYY-MM-DD），表示门户对事件的日期归属，不是原新闻发布时间。日期依据缺失、无效、冲突或月份不匹配时省略该字段；搜索结果不提供事件日期。中文维基使用新闻贡献链接中的明确年月，不按系统当前年份猜测。

**列表 / 查询**：JSON 数组，每条含 `source`、`title`、`url`、`notes`，部分含 `summary`。

**详情**：Markdown 文章，以 `---` 分隔，首行为 `# 标题`。

## 开发

```bash
make fmt        # Prettier 格式化
make lint       # tsc + ESLint
make unittest   # 单元测试（含覆盖率）
make clean      # 清理 node_modules/ coverage/ data/ dist/
make install    # npm install + npm link
make bundle     # esbuild 打包到 dist/web_reader.js
```

### 工程质量检查

安装依赖后使用 `make quality` 运行构建检查、lint、测试及覆盖率、复杂度、MI 和安全扫描。默认 `make` 仅执行 `build`，不会修改代码格式。需要在某一检查失败后继续收集其余结果时，使用 `make -k quality`。

| 命令 | 检查内容 / 失败条件 |
|---|---|
| `make coverage` | c8 覆盖全部生产代码（`lib.ts`、`read.ts`、`src/**/*.ts`、`plugins/**/*.ts`）；每个文件的行、语句、函数、分支覆盖率各至少 51%；排除无运行时代码的纯类型文件 src/types.ts 和 src/cli/types.ts，输出 `coverage/index.html` |
| `make complexity` | ESLint 圈复杂度 ≤9；SonarJS 认知复杂度 ≤14；任一函数超限则失败 |
| `make maintainability` | 每个生产源文件的可维护性指数 MI 必须 >30，否则失败 |
| `make security` | Trivy 扫描 npm 锁文件，包括开发依赖；校验所有锁定包及版本均出现在报告中 |
| `make quality` | 聚合上述检查及 build、lint；测试和覆盖率只运行一次 |

`make unittest` 保留覆盖率输出，与 `make coverage` 等价。复杂度和 MI 不检查测试、工具脚本或生成文件。MI 沿用参考项目的 TypeScript AST/词法统计近似公式：`max(0, (171 - 5.2*ln(V) - 0.23*C - 16.2*ln(L))*100/171)`，其中 V 是估算 Halstead 体积、C 是文件级分支复杂度、L 是非空行数（含注释行）；该指标适合本项目内比较，不等同于其他工具的 MI。

安全检查需要单独安装 [Trivy](https://trivy.dev/docs/latest/getting-started/installation/)，首次运行需要联网下载漏洞数据库。可通过 `make security TRIVY=/path/to/trivy SECURITY_REPORT_DIR=tmp/security` 指定工具和报告目录。完整 JSON 报告为 `tmp/security/source.json`，默认不进入 Git。纯 Node.js 项目扫描锁文件，不迁移 Go 二进制扫描。

与参考项目一致，漏洞数量本身不导致 `security` 失败；扫描工具缺失、扫描出错、报告无效或漏扫任何锁定依赖会失败。扫描成功不表示没有漏洞。所有生产模块（含 `src/`）均参与检查；没有设置豁免或放宽阈值。

TypeScript 暂使用最新兼容的 6.0.x：当前 typescript-eslint 和 SonarJS 要求 TypeScript <6.1，MI 脚本也依赖其编译器 API。运行时基线为 Node 26，使用 Node 26 类型定义和 node26 打包目标。jsdom 保留 27.x、Undici 保留 7.x；提高运行时基线不要求同步升级这些依赖的主版本。其余依赖保留安全升级结果。

### 源码结构

- `read.ts`：CLI/MCP 入口；`lib.ts`：保留插件和外部集成使用的公共导出。
- `src/cli/`：参数校验、预置数据源、输入输出和三种命令模式。
- `src/http/`：请求配置、重定向与编码处理、重试逻辑。
- `src/feeds/`：共用 feed 解析、去重及各数据源的数据转换。
- `src/mcp*.ts`：MCP 工具注册和处理；`src/extract.ts`：正文提取。

## 新增数据源

1. 创建 `plugins/{id}.ts`，导出含 `id` 和 `list()` 的 `Plugin` 对象（类型见 `lib.ts`）
2. 在 `src/cli/sources.ts` 的 `KNOWN_SOURCES` 里添加该 ID

## 作者

Shell <shell909090@gmail.com>

## 版权与授权

MIT License  
Copyright © 2026 Shell
