# web_reader

Node.js 新闻抓取与网页阅读工具，支持获取新闻列表、抓取全文 Markdown、搜索参考资料，以及 MCP server 模式供 AI agent 集成。

> [English](README.md)

## 功能特点

- **25 个数据源**，涵盖中英文——详见下表
- **三个预置组合**：`news`（综合）、`tech`（科技）、`fin`（财经）
- **三种模式**：list（新闻列表）· detail（抓全文）· query（参考搜索）
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
| `reddit` | Reddit | 英文 | ✅ | ✅ | 分类：ml llm ai tech prog investing stocks worldnews；返回条目均为外链帖 |
| `yahoo` | Yahoo Finance | 英文 | ❌ | ✅ | HTML 新闻列表，条数随页面变化 |
| `gnews` | Google News | 英文 | ✅ | ⚠️ | 分类：tech business science health sports entertainment world nation；文章链接为 JS 跳转，需直接访问发布方页面 |
| `cnbc` | CNBC | 英文 | ❌ | ✅ | 分类：top world markets tech finance us health politics intl ai |
| `nytimes` | 纽约时报中文网 | 中文 | ❌ | ✅ | 全文可读 |
| `xinhua` | 新华社 | 中文 | ❌ | ✅ | 分类：politics world society finance tech mil legal health edu |
| `thepaper` | 澎湃新闻 | 中文 | ❌ | ✅ | 国内突发新闻 |
| `caixin` | 财新 | 中文 | ❌ | ✅ | 独立财经报道 |
| `sina` | 新浪新闻 | 中文 | ❌ | ✅ | GB2312 自动转码 |
| `infoq` | InfoQ 中文 | 中文 | ❌ | ✅ | |
| `people` | 人民网 | 中文 | ❌ | ✅ | |
| `hf` | HuggingFace Papers | 英文 | ✅ | ✅ | 每日 ML 论文 |
| `csdn` | CSDN | 中文 | ❌ | ✅ | |
| `oschina` | 开源中国 | 中文 | ❌ | ✅ | |
| `juejin` | 稀土掘金 | 中文 | ❌ | ✅ | |
| `bsky` | Bluesky | 英文 | ✅ | ⚠️ | 分类：news/tech；外链帖可读全文，纯文字帖跳转 Bluesky 社区页 |
| `polymarket` | Polymarket 预测市场 | 英文 | ❌ | ✅ | 按成交量排名的热门预测市场；全文通过 Gamma API 渲染 |

## 环境要求

- Node.js 24.x ≥ 24.15.0 / Node.js ≥ 26.0.0
- npm

## 安装

```bash
nvm install     # 使用 nvm 时，安装 .nvmrc 指定的 Node.js
nvm use
npm install
make install   # 通过 npm link 将 web_reader 安装为全局命令
```

安装后可在任意目录使用 `web_reader` 命令。

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
| `-q` | `--query` | — | 查询数据源（`wiki`/`zhwiki`/`reddit`/`gnews`），关键词跟在后面 |
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

暴露三个工具：`list_news`、`read_url`、`search`。详细 AI 使用说明见 `skills.md`。

## 输出格式

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
| `make coverage` | c8 覆盖全部生产代码（`lib.ts`、`read.ts`、`src/**/*.ts`、`plugins/**/*.ts`）；行、语句、函数、分支覆盖率各至少 51%，输出 `coverage/index.html` |
| `make complexity` | ESLint 圈复杂度 ≤9；SonarJS 认知复杂度 ≤14；任一函数超限则失败 |
| `make maintainability` | 每个生产源文件的可维护性指数 MI 必须 >30，否则失败 |
| `make security` | Trivy 扫描 npm 锁文件，包括开发依赖；校验所有锁定包及版本均出现在报告中 |
| `make quality` | 聚合上述检查及 build、lint；测试和覆盖率只运行一次 |

`make unittest` 保留覆盖率输出，与 `make coverage` 等价。复杂度和 MI 不检查测试、工具脚本或生成文件。MI 沿用参考项目的 TypeScript AST/词法统计近似公式：`max(0, (171 - 5.2*ln(V) - 0.23*C - 16.2*ln(L))*100/171)`，其中 V 是估算 Halstead 体积、C 是文件级分支复杂度、L 是非空行数（含注释行）；该指标适合本项目内比较，不等同于其他工具的 MI。

安全检查需要单独安装 [Trivy](https://trivy.dev/docs/latest/getting-started/installation/)，首次运行需要联网下载漏洞数据库。可通过 `make security TRIVY=/path/to/trivy SECURITY_REPORT_DIR=tmp/security` 指定工具和报告目录。完整 JSON 报告为 `tmp/security/source.json`，默认不进入 Git。纯 Node.js 项目扫描锁文件，不迁移 Go 二进制扫描。

与参考项目一致，漏洞数量本身不导致 `security` 失败；扫描工具缺失、扫描出错、报告无效或漏扫任何锁定依赖会失败。扫描成功不表示没有漏洞。所有生产模块（含 `src/`）均参与检查；没有设置豁免或放宽阈值。

TypeScript 暂使用最新兼容的 6.0.x：当前 typescript-eslint 和 SonarJS 要求 TypeScript <6.1，MI 脚本也依赖其编译器 API。其余直接依赖升级至本次检查时的最新稳定版。

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
