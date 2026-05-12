# news-scraper

A Node.js news scraper that fetches articles from multiple sources via HTTP and outputs structured Markdown and JSON.

> [中文说明](README.cn.md)

## Features

- **16 sources out of the box** — see table below
- **Pure HTTP**: no browser dependency, fast and lightweight
- **Structured output**: `index.json` (metadata) + per-article `.md` files (detail mode)
- **GB2312/GBK support**: Chinese sources decoded correctly
- **Fault-isolated**: one source failing never blocks the others
- **Composable**: list mode outputs JSON; detail mode reads URLs from args or stdin

## Sources

| ID | Site | Language | Notes |
|---|---|---|---|
| `hn` | Hacker News | EN | Score + comments in notes |
| `bbc` | BBC News | EN | |
| `techcrunch` | TechCrunch | EN | |
| `ars` | Ars Technica | EN | Channel + summary field |
| `theverge` | The Verge (AI) | EN | Atom feed, ~10 latest |
| `wikipedia` | Wikipedia Current Events | EN | Date + category + summary |
| `nytimes` | NYT Chinese 纽约时报 | ZH | |
| `huggingface` | HuggingFace Papers | EN | Daily ML papers |
| `cnbc-tech` | CNBC Technology | EN | |
| `cnbc-ai` | CNBC AI | EN | |
| `sina` | Sina 新浪新闻 | ZH | GB2312 auto-decoded |
| `infoq` | InfoQ CN | ZH | |
| `people` | People Daily 人民网 | ZH | |
| `csdn` | CSDN | ZH | Tech blog aggregator |
| `oschina` | OSChina 开源中国 | ZH | Open source news |
| `juejin` | 稀土掘金 | ZH | POST recommend API |

## Requirements

- Node.js ≥ 20
- npm

## Installation

```bash
npm install
```

## Usage

```bash
# List mode — output JSON to stdout
npx tsx news.ts -s hn -n 10
npx tsx news.ts -s hn,bbc,techcrunch
npx tsx news.ts -s all -o data/news/

# Detail mode — fetch full text for specific URLs
npx tsx news.ts -m detail https://arstechnica.com/tech-policy/2026/05/article

# Pipe: get list, pick URLs, fetch content
npx tsx news.ts -s hn -n 5 | jq -r '.[].url' | npx tsx news.ts -m detail
```

### Options

| Short | Long | Default | Description |
|-------|------|---------|-------------|
| `-s` | `--sources` | (required in list mode) | Comma-separated IDs or `all` |
| `-m` | `--mode` | `list` | `list` or `detail` |
| `-n` | `--limit` | `20` | Max articles per source (list mode) |
| `-o` | `--out` | stdout | Write files to DIR/YYYYMMDD/ instead |
| `-c` | `--concurrency` | `2` | Parallel sources (list mode) |
| `-l` | `--loglevel` | `info` | `debug\|info\|warn\|error` |
| `-h` | `--help` | | Show help |

## Output

**List mode** (stdout): JSON array, each record has `source`, `title`, `url`, `notes`, plus optional source-specific fields (e.g. `summary` for Ars Technica, Wikipedia).

**Detail mode** (stdout): Markdown articles separated by `---`, each starting with `# title`.

**With `--out DIR`**: writes `index.json` + `{source}-NNNN.md` files under `DIR/YYYYMMDD/`. Errors go to `_errors.log`.

## Adding a new source

1. Create `plugins/{id}.ts` — export a `Plugin` with `id` and `list()` (see `lib.ts` for types)
2. Add the ID to `KNOWN_SOURCES` in `news.ts`

## Development

```bash
make fmt        # Prettier
make lint       # tsc + ESLint
make unittest   # unit tests with coverage
make test       # unittest + smoke tests
```

## Author

Shell <shell909090@gmail.com>

## License

MIT License  
Copyright © 2026 Shell
