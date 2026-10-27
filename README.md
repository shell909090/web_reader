# web_reader

A Node.js tool for fetching news feeds, reading web pages as Markdown, and searching reference sources.

> [中文说明](README.cn.md)

## Features

- **25 sources** across EN and ZH — see table below
- **Three presets**: `news`, `tech`, `fin`
- **Three modes**: list (news feeds) · detail (full text) · query (reference search)
- **MCP server mode** for AI agent integration (`--mcp`)
- **Pure HTTP**: no browser dependency
- **GB2312/GBK support**: Chinese sources decoded correctly

## Sources

| ID | Site | Language | Search | Detail | Notes |
|---|---|---|---|---|---|
| `hn` | Hacker News | EN | ❌ | ✅ | Score + comments; list items are external article URLs |
| `bbc` | BBC News | EN | ❌ | ✅ | |
| `techcrunch` | TechCrunch | EN | ❌ | ✅ | |
| `ars` | Ars Technica | EN | ❌ | ✅ | `summary` field |
| `theverge` | The Verge (AI) | EN | ❌ | ✅ | Atom feed |
| `mittr` | MIT Technology Review | EN | ❌ | ✅ | categories: ai computing space biotech |
| `wiki` | Wikipedia Current Events | EN | ✅ | ✅ | `summary` field |
| `zhwiki` | 中文维基百科新闻动态 | ZH | ✅ | ✅ | `summary` field |
| `reddit` | Reddit | EN | ✅ | ✅ | categories: ml llm ai tech prog investing stocks worldnews; all returned items are external link posts |
| `yahoo` | Yahoo Finance | EN | ❌ | ✅ | HTML news stream; item count varies |
| `gnews` | Google News | EN | ✅ | ⚠️ | categories: tech business science health sports entertainment world nation; article URLs are JS redirects — detail requires fetching the linked publisher page directly |
| `cnbc` | CNBC | EN | ❌ | ✅ | categories: top world markets tech finance us health politics intl ai |
| `nytimes` | NYT Chinese 纽约时报 | ZH | ❌ | ✅ | full text accessible |
| `xinhua` | 新华社 | ZH | ❌ | ✅ | categories: politics world society finance tech mil legal health edu |
| `thepaper` | 澎湃新闻 | ZH | ❌ | ✅ | breaking news |
| `caixin` | 财新 | ZH | ❌ | ✅ | financial journalism |
| `sina` | 新浪新闻 | ZH | ❌ | ✅ | GB2312 auto-decoded |
| `infoq` | InfoQ CN | ZH | ❌ | ✅ | |
| `people` | 人民网 | ZH | ❌ | ✅ | |
| `hf` | HuggingFace Papers | EN | ✅ | ✅ | daily ML papers |
| `csdn` | CSDN | ZH | ❌ | ✅ | |
| `oschina` | 开源中国 | ZH | ❌ | ✅ | |
| `juejin` | 稀土掘金 | ZH | ❌ | ✅ | |
| `bsky` | Bluesky | EN | ✅ | ⚠️ | categories: news/tech; external link posts readable; pure-text posts link to Bluesky social pages |
| `polymarket` | Polymarket | EN | ❌ | ✅ | top prediction markets by volume; detail renders via Gamma API |

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


HTTP response headers are limited to 64 KiB per response (including redirects), configured by `CONFIG.HTTP_MAX_HEADER_SIZE` in `lib.ts`.

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

### Engineering quality checks

After installing dependencies, run `make quality` for build checks, lint, tests and coverage, complexity, MI, and security scanning. Plain `make` runs `build` without formatting files. Use `make -k quality` to collect the remaining results after a check fails.

| Command | Check / failure condition |
|---|---|
| `make coverage` | c8 includes all production code (`lib.ts`, `read.ts`, `plugins/**/*.ts`); lines, statements, functions, and branches must each reach 51%; HTML output: `coverage/index.html` |
| `make complexity` | ESLint cyclomatic complexity ≤9 and SonarJS cognitive complexity ≤14 per function |
| `make maintainability` | Maintainability Index (MI) must exceed 30 for every production source file |
| `make security` | Trivy scans the npm lockfile including dev dependencies, then verifies every locked package/version appears in the report |
| `make quality` | Aggregates these checks with build and lint, running tests and coverage only once |

`make unittest` retains coverage reporting and is equivalent to `make coverage`. Complexity and MI exclude tests, tooling scripts, and generated files. MI follows the reference project's TypeScript AST/token approximation: `max(0, (171 - 5.2*ln(V) - 0.23*C - 16.2*ln(L))*100/171)`, where V is estimated Halstead volume, C is file-level branch complexity, and L counts nonblank lines (including comment lines). Compare scores within this project; other tools may calculate MI differently.

Install [Trivy](https://trivy.dev/docs/latest/getting-started/installation/) separately. Its first run needs network access to download the vulnerability database. Override the executable and report directory with `make security TRIVY=/path/to/trivy SECURITY_REPORT_DIR=tmp/security`. The full JSON report defaults to `tmp/security/source.json` and is ignored by Git. This Node.js project scans its lockfile; the reference project's Go binary scan does not apply.

As in the reference project, reported vulnerabilities alone do not fail `security`. A missing scanner, scan error, invalid report, or missing locked dependency does. A successful scan does not mean there are no vulnerabilities. Existing complexity and MI violations currently fail `quality` and need subsequent refactoring; no exemptions or relaxed thresholds are applied.

## Adding a new source

1. Create `plugins/{id}.ts` — export a `Plugin` with `id` and `list()` (see `lib.ts`)
2. Add the ID to `KNOWN_SOURCES` in `read.ts`

## Author

Shell <shell909090@gmail.com>

## License

MIT License  
Copyright © 2026 Shell
