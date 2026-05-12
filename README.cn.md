# news-scraper

一个 Node.js 新闻抓取工具，通过 HTTP 从多家新闻网站抓取最新文章，统一输出为 Markdown 和 JSON，供 LLM 或人工处理。

> [English](README.md)

## 功能特点

- **开箱即用 16 个数据源**——详见下表
- **纯 HTTP**：无浏览器依赖，速度快、轻量
- **结构化输出**：`index.json`（元数据）+ 每篇文章独立 `.md` 文件（detail 模式）
- **GB2312/GBK 支持**：中文源编码正确处理
- **故障隔离**：单个源失败不影响其他源
- **可组合**：list 模式输出 JSON，detail 模式从参数或 stdin 读取 URL

## 数据源

| ID | 网站 | 语言 | 备注 |
|---|---|---|---|
| `hn` | Hacker News | 英文 | notes 含评分和评论数 |
| `bbc` | BBC News | 英文 | |
| `techcrunch` | TechCrunch | 英文 | |
| `ars` | Ars Technica | 英文 | 含频道名和摘要字段 |
| `theverge` | The Verge（AI 版块）| 英文 | Atom feed，约 10 条最新 |
| `wiki` | Wikipedia 时事 | 英文 | 含日期、分类和摘要 |
| `nytimes` | 纽约时报中文网 | 中文 | |
| `huggingface` | HuggingFace Papers | 英文 | 每日 ML 论文 |
| `cnbc-tech` | CNBC Technology | 英文 | |
| `cnbc-ai` | CNBC AI | 英文 | |
| `sina` | 新浪新闻 | 中文 | GB2312 自动转码 |
| `infoq` | InfoQ 中文 | 中文 | |
| `people` | 人民网 | 中文 | |
| `csdn` | CSDN | 中文 | 技术博客聚合 |
| `oschina` | 开源中国 | 中文 | 开源项目新闻 |
| `juejin` | 稀土掘金 | 中文 | POST 推荐接口 |

## 环境要求

- Node.js ≥ 20
- npm

## 安装

```bash
npm install
```

## 使用方法

```bash
# 列表模式——输出 JSON 到 stdout
npx tsx news.ts -s hn -n 10
npx tsx news.ts -s hn,bbc,techcrunch
npx tsx news.ts -s all -o data/news/

# 详情模式——抓取指定 URL 的全文
npx tsx news.ts -m detail https://arstechnica.com/tech-policy/2026/05/article

# 管道：获取列表，挑选 URL，抓取全文
npx tsx news.ts -s hn -n 5 | jq -r '.[].url' | npx tsx news.ts -m detail
```

### 参数说明

| 短参数 | 长参数 | 默认值 | 说明 |
|--------|--------|--------|------|
| `-s` | `--sources` | （list 模式必填）| 逗号分隔的 ID 或 `all` |
| `-m` | `--mode` | `list` | `list` 或 `detail` |
| `-n` | `--limit` | `20` | 每源最多抓取条数（list 模式）|
| `-o` | `--out` | stdout | 写文件到 DIR/YYYYMMDD/ |
| `-c` | `--concurrency` | `2` | 并发数（list 模式）|
| `-l` | `--loglevel` | `info` | `debug\|info\|warn\|error` |
| `-h` | `--help` | | 显示帮助 |

## 输出格式

**列表模式**（stdout）：JSON 数组，每条含 `source`、`title`、`url`、`notes`，部分源有 `summary` 等扩展字段。

**详情模式**（stdout）：各篇文章 Markdown，以 `---` 分隔，首行为 `# 标题`。

**带 `--out DIR`**：在 `DIR/YYYYMMDD/` 下写 `index.json` + `{source}-NNNN.md`；错误写入 `_errors.log`。

## 新增数据源

1. 创建 `plugins/{id}.ts`，导出含 `id` 和 `list()` 的 `Plugin` 对象（类型定义见 `lib.ts`）
2. 在 `news.ts` 的 `KNOWN_SOURCES` 里添加该 ID

## 开发

```bash
make fmt        # Prettier 格式化
make lint       # tsc + ESLint
make unittest   # 单元测试（含覆盖率）
make test       # unittest + smoke 测试
```

## 作者

Shell <shell909090@gmail.com>

## 版权与授权

MIT License  
Copyright © 2026 Shell
