# news-scraper

一个 Node.js 新闻抓取工具，从多家新闻网站抓取最新文章，统一输出为 Markdown 和 JSON，供 LLM 或人工处理。大多数源使用原生 `fetch` + Cheerio，仅在必要时才启动 Playwright（Chromium）。

> [English](README.md)

## 功能特点

- **开箱即用 11 个数据源**——详见下表
- **HTTP 优先**：只有确实需要 JS 渲染的源才会启动 Playwright
- **结构化输出**：`index.json`（元数据）+ 每篇文章独立 `.md` 文件
- **GB2312/GBK 支持**：中文源编码正确处理
- **故障隔离**：单个源失败不影响其他源

## 数据源

| ID | 网站 | 语言 | 方式 | 备注 |
|---|---|---|---|---|
| `hn` | Hacker News | 英文 | HTTP | 含评分和评论数 |
| `bbc` | BBC News | 英文 | HTTP | |
| `techcrunch` | TechCrunch | 英文 | HTTP | |
| `ars` | Ars Technica | 英文 | HTTP | notes 含频道名 |
| `theverge` | The Verge（AI 版块）| 英文 | HTTP（Atom）| 约 10 条最新 |
| `wikipedia` | Wikipedia | 英文 | HTTP | "In the news" 新闻条目 |
| `nytimes` | 纽约时报中文网 | 中文 | HTTP | |
| `huggingface` | HuggingFace Papers | 英文 | HTTP | 每日 ML 论文 |
| `cnbc-tech` | CNBC Technology | 英文 | HTTP | |
| `sina` | 新浪新闻 | 中文 | HTTP | GB2312 自动转码 |
| `infoq` | InfoQ 中文 | 中文 | HTTP | |
| `people` | 人民网 | 中文 | HTTP | |
| `csdn` | CSDN | 中文 | HTTP | 技术博客聚合 |
| `oschina` | 开源中国 | 中文 | HTTP | 开源项目新闻 |
| `juejin` | 稀土掘金 | 中文 | HTTP（API）| POST 推荐接口 |
| `cnbc-ai` | CNBC AI | 英文 | HTTP | |
| `reuters` | Reuters | 英文 | 浏览器 | 部分 IP 被 DataDome 拦截 |

## 环境要求

- Node.js ≥ 20
- npm

## 安装

```bash
npm install
npx playwright install chromium   # 仅 Reuters 和 CNBC AI 需要
```

Playwright 浏览器二进制文件存放于 `~/.cache/ms-playwright/`。升级 `playwright` npm 包后必须重新执行 `npx playwright install chromium`。

### Linux 系统库（Playwright 依赖）

Playwright 的 Chromium 需要若干系统共享库，首次使用前安装一次：

```bash
# Debian / Ubuntu
sudo apt-get install -y \
  libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libxkbcommon0 libxcomposite1 libxdamage1 \
  libxfixes3 libxrandr2 libgbm1 libasound2
```

也可使用官方工具（需要 sudo）：

```bash
npx playwright install-deps chromium
```

缺少系统库时 Playwright 会报 `error while loading shared libraries`，工具会将错误写入 stderr / `_errors.log`，不影响其他数据源继续运行。

### Reuters / CNBC AI 访问限制

这两个源使用 Playwright 绕过 JS 渲染，但在无头浏览器或数据中心 IP 环境中仍可能被反爬机制拦截（HTTP 401/403）。若返回 0 条结果，其他数据源不受影响。

## 使用方法

```bash
# 列表模式：抓取 HN 文章标题和链接
npx tsx news.ts --sources hn --mode list --limit 20

# 详情模式：抓取 BBC 文章全文（3 篇）
npx tsx news.ts --sources bbc --mode detail --limit 3

# 所有源，列表模式，2 路并发
npx tsx news.ts --sources all --mode list --concurrency 2

# 开启调试日志
npx tsx news.ts --sources techcrunch --mode list --debug
```

### 参数说明

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--sources` | （必填）| 逗号分隔的 source ID 或 `all`。可用：`hn`、`bbc`、`techcrunch`、`sina`、`reuters`、`cnbc-ai` |
| `--mode` | `list` | `list`（标题+链接）或 `detail`（全文） |
| `--limit` | `20` | 每源最多抓取条数 |
| `--out` | `data/news/` | 输出根目录 |
| `--concurrency` | `2` | 并发数 |
| `--debug` | 关闭 | 向 stderr 输出详细日志 |

## 输出格式

结果存储在 `data/news/YYYYMMDD/` 目录下：

- **`list.json`** — 扁平数组，每条记录包含 `source`、`title`、`url`、`notes`，详情模式还有 `md_path`
- **`{source}-NNNN.md`** — 文章正文（仅详情模式），首行为 `# 标题`
- **`_errors.log`** — 换行符分隔的 JSON，每行一条失败记录

## 新增数据源

1. 在 `plugins/{id}.ts` 创建并导出一个 `Plugin` 对象（类型定义见 `lib.ts`）
2. 将 ID 添加到 `news.ts` 的 `KNOWN_SOURCES`
3. 完成——无需修改其他文件

## 开发

```bash
make fmt        # 用 Prettier 格式化代码
make lint       # tsc + ESLint 检查
make build      # 仅类型检查
make unittest   # 单元测试（含覆盖率）
make test       # 单元测试 + smoke 测试
```

## 作者

Shell <shell909090@gmail.com>

## 版权与授权

MIT License  
Copyright © 2026 Shell
