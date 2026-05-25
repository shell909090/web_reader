# web_reader

A Node.js tool for fetching news feeds, reading web pages as Markdown, and searching reference sources.

> [中文说明](README.cn.md)

## Features

- **24 sources** across EN and ZH — see table below
- **Three presets**: `news`, `tech`, `fin`
- **Three modes**: list (news feeds) · detail (full text) · query (reference search)
- **MCP server mode** for AI agent integration (`--mcp`)
- **Pure HTTP**: no browser dependency
- **GB2312/GBK support**: Chinese sources decoded correctly

## Sources

| ID | Site | Language | Search | Detail | Notes |
|---|---|---|---|---|---|
| `hn` | Hacker News | EN | ❌ | ⚠️ | Score + comments; external article URLs (HN thread URLs are discussions) |
| `bbc` | BBC News | EN | ❌ | ✅ | |
| `techcrunch` | TechCrunch | EN | ❌ | ✅ | |
| `ars` | Ars Technica | EN | ❌ | ✅ | `summary` field |
| `theverge` | The Verge (AI) | EN | ❌ | ✅ | Atom feed |
| `mittr` | MIT Technology Review | EN | ❌ | ✅ | categories: ai computing space biotech |
| `wiki` | Wikipedia Current Events | EN | ✅ | ✅ | `summary` field |
| `zhwiki` | 中文维基百科新闻动态 | ZH | ✅ | ✅ | `summary` field |
| `reddit` | Reddit | EN | ✅ | ⚠️ | categories: ml llm ai tech prog investing stocks worldnews; link posts only (`/comments/` requires login) |
| `yahoo` | Yahoo Finance | EN | ❌ | ✅ | RSS, 48 items |
| `gnews` | Google News | EN | ✅ | ⚠️ | categories: tech business science health sports entertainment world nation; redirects to publisher (varies) |
| `cnbc` | CNBC | EN | ❌ | ✅ | categories: top world markets tech finance us health politics intl ai |
| `nytimes` | NYT Chinese 纽约时报 | ZH | ❌ | ✅ | full text accessible |
| `xinhua` | 新华社 | ZH | ❌ | ✅ | categories: politics world society finance tech mil legal health edu |
| `thepaper` | 澎湃新闻 | ZH | ❌ | ✅ | breaking news |
| `caixin` | 财新 | ZH | ❌ | ✅ | financial journalism |
| `sina` | 新浪新闻 | ZH | ❌ | ⚠️ | GB2312 auto-decoded |
| `infoq` | InfoQ CN | ZH | ❌ | ✅ | |
| `people` | 人民网 | ZH | ❌ | ⚠️ | |
| `hf` | HuggingFace Papers | EN | ✅ | ✅ | daily ML papers |
| `csdn` | CSDN | ZH | ❌ | ⚠️ | |
| `oschina` | 开源中国 | ZH | ❌ | ⚠️ | |
| `juejin` | 稀土掘金 | ZH | ❌ | ⚠️ | |
| `bsky` | Bluesky | EN | ✅ | ⚠️ | categories: news/tech; external link posts only (Bsky post pages are social, not articles) |

## Requirements

- Node.js ≥ 20
- npm

## Installation

```bash
npm install
make install   # installs web_reader as a global command via npm link
```

After `make install`, `web_reader` is available from any directory.

## Usage

Mode is inferred: `-s` → list, `-q` → query, otherwise → detail.

```bash
# List mode — fetch news, output JSON to stdout
web_reader -s news                       # bbc + nytimes + xinhua + thepaper
web_reader -s tech                       # hn + ars + mittr + infoq
web_reader -s fin                        # caixin + yahoo + cnbc:markets
web_reader -s cnbc:markets,cnbc:tech -n 30
web_reader -s fin -o fin.json            # write to file

# Detail mode — fetch full text as Markdown
web_reader https://arstechnica.com/...
web_reader -o article.md https://...

# Pipe: list → pick URLs → read full text
web_reader -s hn -n 5 | jq -r '.[].url' | web_reader
web_reader -s tech | jq -r '.[].url' | web_reader -o articles.md

# Query mode — search a reference source
web_reader -q wiki transformer architecture
web_reader -q zhwiki 注意力机制
web_reader -q reddit "open source LLM"
web_reader -q wiki attention mechanism | jq -r '.[0].url' | web_reader
```

### Options

| Short | Long | Default | Description |
|-------|------|---------|-------------|
| `-s` | `--sources` | — | Source IDs, preset names (`news`/`tech`/`fin`), or `all` |
| `-q` | `--query` | — | Query source (`wiki`/`zhwiki`/`reddit`/`gnews`); keywords follow |
| `-n` | `--limit` | `50` | Max results |
| `-o` | `--out` | stdout | Write output to FILE |
| `-c` | `--concurrency` | `2` | Parallel sources (list mode) |
| `-l` | `--loglevel` | `warn` | `debug\|info\|warn\|error` |
| `-h` | `--help` | | Show help |

## MCP Server (AI agent integration)

```bash
web_reader --mcp   # start as MCP server on stdio
```

Configure in `.claude/settings.json`:
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

Exposes three tools: `list_news`, `read_url`, `search`. See `skills.md` for full AI usage guide.

## Output

**List / query**: JSON array. Each record: `source`, `title`, `url`, `notes`, optional `summary`.

**Detail**: Markdown articles separated by `---`, starting with `# title`.

## Development

```bash
make fmt        # Prettier
make lint       # tsc + ESLint
make unittest   # unit tests with coverage
make clean      # remove node_modules/ coverage/ data/ dist/
make install    # npm install + npm link
make bundle     # esbuild bundle to dist/web_reader.js
```

## Adding a new source

1. Create `plugins/{id}.ts` — export a `Plugin` with `id` and `list()` (see `lib.ts`)
2. Add the ID to `KNOWN_SOURCES` in `read.ts`

## Author

Shell <shell909090@gmail.com>

## License

MIT License  
Copyright © 2026 Shell
