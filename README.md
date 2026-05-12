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
| `wiki` | Wikipedia Current Events | EN | Date + category + summary |
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

Mode is inferred: `-s` present → list mode; no `-s` → detail mode (URLs from args or stdin).

```bash
# List mode — fetch article lists, output JSON to stdout
npx tsx news.ts -s hn -n 10
npx tsx news.ts -s hn,bbc,wsj
npx tsx news.ts -s wsj:markets,wsj:world -n 50
npx tsx news.ts -s cnbc:tech,cnbc:ai
npx tsx news.ts -s all -o news.json      # write to file

# Detail mode — fetch full text for URLs
npx tsx news.ts https://arstechnica.com/tech-policy/2026/05/article
npx tsx news.ts -o article.md https://...   # write to file

# Pipe: list → pick URLs → fetch full text
npx tsx news.ts -s hn -n 5 | jq -r '.[].url' | npx tsx news.ts
npx tsx news.ts -s hn -n 5 | jq -r '.[].url' | npx tsx news.ts -o articles.md
```

### Options

| Short | Long | Default | Description |
|-------|------|---------|-------------|
| `-s` | `--sources` | — | Comma-separated IDs or `all`; triggers list mode |
| `-n` | `--limit` | `50` | Max articles per source (list mode) |
| `-o` | `--out` | stdout | Write output to FILE (JSON or markdown) |
| `-c` | `--concurrency` | `2` | Parallel sources (list mode) |
| `-l` | `--loglevel` | `warn` | `debug\|info\|warn\|error` |
| `-h` | `--help` | | Show help |

### Sources with categories

| Source | Categories |
|--------|-----------|
| `wsj` | `world` `us` `markets` `opinion` `main` |
| `cnbc` | `top` `world` `markets` `tech` `finance` `us` `health` `politics` `intl` `ai` |
| `mittr` | `ai` `computing` `space` `biotech` (default: main RSS) |

## Output

**List mode**: JSON array to stdout (or `-o file.json`). Each record has `source`, `title`, `url`, `notes`, plus optional fields like `summary`.

**Detail mode**: Markdown articles to stdout (or `-o file.md`), separated by `---`. Fetch errors go to stderr.

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
