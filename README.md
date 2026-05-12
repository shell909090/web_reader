# news-scraper

A Node.js news scraper that fetches articles from multiple sources and outputs structured Markdown and JSON. Uses native `fetch` + Cheerio for most sources, Playwright (Chromium) only when JavaScript rendering is required.

> [中文说明](README.cn.md)

## Features

- **11 sources out of the box** — see table below
- **HTTP-first**: Playwright is only launched when a source actually needs it
- **Structured output**: `index.json` (metadata) + per-article `.md` files
- **GB2312/GBK support**: Chinese sources decoded correctly
- **Fault-isolated**: one source failing never blocks the others

## Sources

| ID | Site | Language | Method | Notes |
|---|---|---|---|---|
| `hn` | Hacker News | EN | HTTP | Top stories, score + comments |
| `bbc` | BBC News | EN | HTTP | |
| `techcrunch` | TechCrunch | EN | HTTP | |
| `ars` | Ars Technica | EN | HTTP | Channel in notes |
| `theverge` | The Verge (AI) | EN | HTTP (Atom) | ~10 latest |
| `wikipedia` | Wikipedia | EN | HTTP | "In the news" bullets |
| `nytimes` | NYT Chinese 纽约时报 | ZH | HTTP | |
| `huggingface` | HuggingFace Papers | EN | HTTP | Daily ML papers |
| `cnbc-tech` | CNBC Technology | EN | HTTP | |
| `sina` | Sina 新浪新闻 | ZH | HTTP | GB2312 auto-decoded |
| `infoq` | InfoQ CN | ZH | HTTP | |
| `people` | People Daily 人民网 | ZH | HTTP | |
| `csdn` | CSDN | ZH | HTTP | Tech blog aggregator |
| `oschina` | OSChina 开源中国 | ZH | HTTP | Open source news |
| `juejin` | 稀土掘金 | ZH | HTTP (API) | POST recommend API |
| `reuters` | Reuters | EN | Browser | Blocked by DataDome on some IPs |
| `cnbc-ai` | CNBC AI | EN | Browser | |

## Requirements

- Node.js ≥ 20
- npm

## Installation

```bash
npm install
npx playwright install chromium   # only needed for Reuters and CNBC AI
```

Playwright binaries are stored in `~/.cache/ms-playwright/`. If you upgrade the `playwright` npm package, re-run `npx playwright install chromium`.

### System libraries for Playwright (Linux only)

Playwright's Chromium requires several shared libraries. Install them once with:

```bash
# Debian / Ubuntu
sudo apt-get install -y \
  libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libxkbcommon0 libxcomposite1 libxdamage1 \
  libxfixes3 libxrandr2 libgbm1 libasound2
```

Or use the official helper (requires sudo):

```bash
npx playwright install-deps chromium
```

If libraries are missing, Playwright will crash with `error while loading shared libraries`. The tool catches this and writes the error to stderr / `_errors.log` rather than aborting other sources.

### Reuters / CNBC AI access

These sources use Playwright to bypass JS rendering, but may still be blocked by bot-detection (HTTP 401/403) in headless environments or data-centre IPs. If they return 0 items, the other sources are unaffected.

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
