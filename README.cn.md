# web_reader

Node.js 新闻抓取与网页阅读工具，支持获取新闻列表、抓取全文 Markdown、搜索参考资料，以及 MCP server 模式供 AI agent 集成。

> [English](README.md)

## 功能特点

- **24 个数据源**，涵盖中英文——详见下表
- **三个预置组合**：`news`（综合）、`tech`（科技）、`fin`（财经）
- **三种模式**：list（新闻列表）· detail（抓全文）· query（参考搜索）
- **MCP server 模式**，供 AI agent 调用（`--mcp`）
- **纯 HTTP**：无浏览器依赖
- **GB2312/GBK 支持**：中文源编码自动处理

## 数据源

| ID | 网站 | 语言 | 搜索 | 全文 | 备注 |
|---|---|---|---|---|---|
| `hn` | Hacker News | 英文 | ❌ | ⚠️ | 含评分和评论数；外链文章可读，HN 讨论页不是文章 |
| `bbc` | BBC News | 英文 | ❌ | ✅ | |
| `techcrunch` | TechCrunch | 英文 | ❌ | ✅ | |
| `ars` | Ars Technica | 英文 | ❌ | ✅ | 含 `summary` 字段 |
| `theverge` | The Verge（AI 版块）| 英文 | ❌ | ✅ | Atom feed |
| `mittr` | MIT Technology Review | 英文 | ❌ | ✅ | 分类：ai computing space biotech |
| `wiki` | Wikipedia 时事 | 英文 | ✅ | ✅ | 含 `summary` 字段 |
| `zhwiki` | 中文维基百科新闻动态 | 中文 | ✅ | ✅ | 含 `summary` 字段 |
| `reddit` | Reddit | 英文 | ✅ | ⚠️ | 分类：ml llm ai tech prog investing stocks worldnews；仅外链帖可读（`/comments/` 需登录） |
| `yahoo` | Yahoo Finance | 英文 | ❌ | ✅ | RSS，48 条 |
| `gnews` | Google News | 英文 | ✅ | ⚠️ | 分类：tech business science health sports entertainment world nation；跳转发布方，可用性因站而异 |
| `cnbc` | CNBC | 英文 | ❌ | ✅ | 分类：top world markets tech finance us health politics intl ai |
| `nytimes` | 纽约时报中文网 | 中文 | ❌ | ✅ | 全文可读 |
| `xinhua` | 新华社 | 中文 | ❌ | ✅ | 分类：politics world society finance tech mil legal health edu |
| `thepaper` | 澎湃新闻 | 中文 | ❌ | ✅ | 国内突发新闻 |
| `caixin` | 财新 | 中文 | ❌ | ✅ | 独立财经报道 |
| `sina` | 新浪新闻 | 中文 | ❌ | ⚠️ | GB2312 自动转码 |
| `infoq` | InfoQ 中文 | 中文 | ❌ | ✅ | |
| `people` | 人民网 | 中文 | ❌ | ⚠️ | |
| `hf` | HuggingFace Papers | 英文 | ✅ | ✅ | 每日 ML 论文 |
| `csdn` | CSDN | 中文 | ❌ | ⚠️ | |
| `oschina` | 开源中国 | 中文 | ❌ | ⚠️ | |
| `juejin` | 稀土掘金 | 中文 | ❌ | ⚠️ | |
| `bsky` | Bluesky | 英文 | ✅ | ⚠️ | 分类：news/tech；仅含外链的帖子可读全文，纯文字帖跳转社区页 |

## 环境要求

- Node.js ≥ 20
- npm

## 安装

```bash
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

## 新增数据源

1. 创建 `plugins/{id}.ts`，导出含 `id` 和 `list()` 的 `Plugin` 对象（类型见 `lib.ts`）
2. 在 `read.ts` 的 `KNOWN_SOURCES` 里添加该 ID

## 作者

Shell <shell909090@gmail.com>

## 版权与授权

MIT License  
Copyright © 2026 Shell
