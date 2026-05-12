# news-scraper

A Node.js news scraper that fetches articles from multiple sources and outputs structured Markdown and JSON. Uses native `fetch` + Cheerio for most sources, Playwright (Chromium) only when JavaScript rendering is required.

> [中文说明](README.cn.md)

## Features

- **6 sources out of the box**: Hacker News, BBC, TechCrunch, Sina News, Reuters, CNBC AI
- **HTTP-first**: Playwright is only launched when a source actually needs it
- **Structured output**: `list.json` (metadata) + per-article `.md` files
- **GB2312/GBK support**: Chinese sources decoded correctly
- **Fault-isolated**: one source failing never blocks the others

## Requirements

- Node.js ≥ 20
- npm

## Installation

```bash
npm install
npx playwright install chromium   # only needed for Reuters and CNBC AI
```

Playwright binaries are stored in `~/.cache/ms-playwright/`. If you upgrade the `playwright` npm package, re-run `npx playwright install chromium`.

## Usage

```bash
# List mode: fetch article titles and URLs for HN
npx tsx news.ts --sources hn --mode list --limit 20

# Detail mode: fetch full article text for BBC (3 articles)
npx tsx news.ts --sources bbc --mode detail --limit 3

# All sources, list mode, 2 parallel
npx tsx news.ts --sources all --mode list --concurrency 2

# Debug logging
npx tsx news.ts --sources techcrunch --mode list --debug
```

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--sources` | (required) | Comma-separated IDs or `all`. Available: `hn`, `bbc`, `techcrunch`, `sina`, `reuters`, `cnbc-ai` |
| `--mode` | `list` | `list` (titles + URLs) or `detail` (full article text) |
| `--limit` | `20` | Max articles per source |
| `--out` | `data/news/` | Output root directory |
| `--concurrency` | `2` | Parallel source limit |
| `--debug` | off | Verbose logging to stderr |

## Output

Results land in `data/news/YYYYMMDD/`:

- **`list.json`** — flat array of records; each has `source`, `title`, `url`, `notes`, and (in detail mode) `md_path`
- **`{source}-NNNN.md`** — article text in Markdown (detail mode only); starts with `# title`
- **`_errors.log`** — newline-delimited JSON, one entry per failed fetch

## Adding a new source

1. Create `plugins/{id}.ts` exporting a `Plugin` object (see `lib.ts` for the type)
2. Add the ID to `KNOWN_SOURCES` in `news.ts`
3. That's it — no other files need changing

## Development

```bash
make fmt        # format with Prettier
make lint       # tsc + ESLint
make build      # type-check only
make unittest   # unit tests with coverage
make test       # unittest + smoke tests
```

## Author

Shell <shell909090@gmail.com>

## License

MIT License  
Copyright © 2026 Shell
