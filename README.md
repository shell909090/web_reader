# web_reader

A Node.js tool for fetching news feeds, reading web pages as Markdown, and searching the web and reference sources.

> [中文说明](README.cn.md)

## Features

- **25 sources** across EN and ZH — see table below
- **Three presets**: `news`, `tech`, `fin`
- **Three modes**: list (news feeds) · detail (full text) · query (search)
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
| `reddit` | Reddit | EN | ❌ | ⚠️ | Feeds and search are subject to access restrictions and may return 429; discussion pages may return 403. Items may be external links or discussion posts; publisher access varies. |
| `yahoo` | Yahoo Finance | EN | ❌ | ✅ | HTML news stream; item count varies |
| `gnews` | Google News | EN | ✅ | ⚠️ | categories: tech business science health sports entertainment world nation; article URLs are JS redirects — detail requires fetching the linked publisher page directly |
| `cnbc` | CNBC | EN | ❌ | ✅ | categories: top world markets tech finance us health politics intl ai |
| `nytimes` | NYT Chinese 纽约时报 | ZH | ❌ | ✅ | full text accessible |
| `xinhua` | 新华社 | ZH | ❌ | ✅ | categories: politics world society finance tech mil legal health edu |
| `thepaper` | 澎湃新闻 | ZH | ❌ | ✅ | breaking news |
| `caixin` | 财新 | ZH | ❌ | ⚠️ | May return a subscription preview; full-text completeness is not guaranteed. |
| `sina` | 新浪新闻 | ZH | ❌ | ✅ | GB2312 auto-decoded |
| `infoq` | InfoQ CN | ZH | ❌ | ✅ | |
| `people` | 人民网 | ZH | ❌ | ✅ | Homepage order; explicitly hidden sections excluded. Not sorted by publication date. |
| `hf` | HuggingFace Papers | EN | ✅ | ✅ | daily ML papers |
| `csdn` | CSDN | ZH | ❌ | ❌ | Feed and article access restrictions differ. HTTP 521 prevents retrieving article content and publication times. |
| `oschina` | 开源中国 | ZH | ❌ | ✅ | Article content via API; external redirect entries require reading the publisher URL directly. |
| `juejin` | 稀土掘金 | ZH | ❌ | ✅ | |
| `bsky` | Bluesky | EN | ❌ | ⚠️ | news/tech feeds and search have separate access restrictions. Search may return 403; credentials do not guarantee access. External articles depend on publisher access; text-only posts link to social pages. |
| `polymarket` | Polymarket | EN | ❌ | ✅ | top prediction markets by volume; detail renders via Gamma API |

### Access restrictions

The tool does not bypass logins, paywalls, CAPTCHAs, or restrictions on automated access. A readable feed does not guarantee readable linked articles, and a successful response does not prove that the full article was retrieved. In the table, ✅ means supported functionality, ⚠️ means partial access or uncertain completeness, and ❌ is explained in Notes.

A 403 response does not by itself identify missing credentials, and credentials do not guarantee access. See [source access restrictions](docs/source-access.md) (Chinese).

Article requests report unsuccessful HTTP responses rather than treating denial pages as content. Some Google News links require the publisher's URL; Caixin may return a preview. Search methods and configuration requirements are listed separately below.

## Search providers and configuration

Run `web_reader -q SOURCE "keywords" -n 5`. The providers below support search only and are excluded from `-s all` and news presets. Existing wiki, zhwiki, reddit, gnews, hf and bsky search entry points remain available; Reddit and Bluesky have the access limitations described above.

| SOURCE | Required credential or setting | Search method |
|---|---|---|
| `brave` | Brave Search API key | Brave web search API |
| `tavily` | Tavily API key | Tavily search API |
| `exa` | None; optional API key | Remote MCP without a key; REST API with a key |
| `parallel` | None; optional API key | Web search via remote MCP |
| `firecrawl` | None; optional API key | Web search via remote MCP |
| `keenable` | None; optional API key | Public HTTP API without a key; authenticated API with a key |
| `wolframalpha` | Full Results API AppID | Computational and knowledge answers |
| `duckduckgo` | None | HTML web search |
| `searxng` | Instance URL with JSON enabled | JSON search API of the configured instance |


### Search without a key

Exa, Parallel, Firecrawl and Keenable work without a configuration file, account registration or an additional client:

```bash
web_reader -q exa "TypeScript documentation" -n 5
web_reader -q parallel "TypeScript documentation" -n 5
web_reader -q firecrawl "TypeScript documentation" -n 5
web_reader -q keenable "TypeScript documentation" -n 5
```

Without a key, requests use the provider's public allowance and may be rate limited. Setting that provider's `api_key` or matching environment variable uses your credentials and the provider's account quotas and billing rules. Failures or rate limits do not trigger a switch of authentication method, endpoint or provider. Only search is invoked, without follow-up page retrieval or research tasks.

### HTTP proxies

All shared HTTP requests in CLI and MCP read proxy environment variables. No configuration file changes are needed:

```bash
export HTTP_PROXY='http://PROXY_HOST:PROXY_PORT'
export HTTPS_PROXY='http://PROXY_HOST:PROXY_PORT'
export NO_PROXY='localhost,127.0.0.1'
web_reader -q duckduckgo "TypeScript documentation" -n 5
```

Replace the example address with your proxy address. `HTTP_PROXY` handles HTTP destinations; `HTTPS_PROXY` handles HTTPS destinations and falls back to HTTP_PROXY when unset. The variable name describes the destination protocol: HTTPS_PROXY may contain an HTTP proxy URL.

Lowercase `http_proxy`, `https_proxy` and `no_proxy` are also supported and take precedence over their uppercase equivalents. `NO_PROXY` accepts comma-separated hosts or domains, optionally with ports; `*` bypasses the proxy for all destinations. Without proxy settings, connections are direct. A failed proxy connection is reported as an error, without an automatic direct fallback.

MCP inherits the environment of its launching process. When a client launches the server, set these variables in that client's MCP environment configuration. Proxy support preserves request timeouts, access restrictions and search credential isolation.

### Obtain credentials

- [Brave Search API](https://api-dashboard.search.brave.com/): create an account and obtain a Search API key.
- [Tavily](https://app.tavily.com/): obtain an API key.
- [Exa](https://dashboard.exa.ai/): optionally obtain an API key.
- [Parallel](https://platform.parallel.ai/), [Firecrawl](https://www.firecrawl.dev/app/api-keys) and [Keenable](https://app.keenable.ai/): optional accounts and API keys.
- [WolframAlpha](https://developer.wolframalpha.com/): create an application for an AppID with Full Results API access.

Pricing, quotas and API access depend on the provider. This tool does not create accounts, purchase access or automatically switch to another paid provider.

### Option 1: configuration file

The default is `$XDG_CONFIG_HOME/web_reader/config.toml`, or `~/.config/web_reader/config.toml` when XDG_CONFIG_HOME is unset. The file is optional.

Include only the sections you need. Omit sections for keyless use; do not insert a placeholder key, since the program would send it as a real credential. Replace all example credentials and addresses with your own values.

```toml
[providers.brave]
api_key = "your-brave-key"

[providers.tavily]
api_key = "your-tavily-key"

[providers.exa]
api_key = "your-exa-key"

[providers.wolframalpha]
app_id = "your-wolframalpha-app-id"

[providers.searxng]
base_url = "https://search.example.com"
```

No environment variables are required when the file contains the settings. Use file permissions `0600` and keep real credentials out of git. Add `enabled = false` to any provider section to disable it.

To select another file:

```bash
web_reader --config /path/to/config.toml -q brave "TypeScript documentation" -n 5
web_reader --config /path/to/config.toml --mcp
```

An explicit file replaces the default file; a missing or malformed explicit file is an error. The program does not automatically load configuration or `.env` from the working directory.

Optional credentials can be supplied through either of these equivalent settings:

| Provider | TOML field | Environment variable |
|---|---|---|
| Exa | `providers.exa.api_key` | `EXA_API_KEY` |
| Parallel | `providers.parallel.api_key` | `PARALLEL_API_KEY` |
| Firecrawl | `providers.firecrawl.api_key` | `FIRECRAWL_API_KEY` |
| Keenable | `providers.keenable.api_key` | `KEENABLE_API_KEY` |

### Option 2: environment variables

No configuration file is needed. Set only the variables for providers you use:

```bash
export BRAVE_API_KEY='your-brave-key'
export TAVILY_API_KEY='your-tavily-key'
export EXA_API_KEY='your-exa-key'
export WOLFRAMALPHA_APP_ID='your-wolframalpha-app-id'
export SEARXNG_BASE_URL='https://search.example.com'
web_reader -q brave "TypeScript documentation" -n 5
```

When both are present, environment variables override individual file fields; other fields still come from the file. An explicitly empty credential overrides the file value: keyless providers use their public entry point, while providers requiring credentials report a missing-credential error. `<SOURCE>_ENABLED` accepts `true` or `false`, for example `BRAVE_ENABLED=false`.

REST API providers also accept `base_url` (or the uppercase source name plus `_BASE_URL`) for a trusted API root, using HTTPS. The adapter appends its endpoint path. Defaults are `https://api.search.brave.com`, `https://api.tavily.com`, `https://api.exa.ai`, `https://api.wolframalpha.com` and `https://api.keenable.ai`. Changing this address changes who receives the credential; it is not a mechanism for bypassing refusals. DuckDuckGo does not use custom endpoints.

Exa's keyless path, Parallel and Firecrawl use a built-in remote MCP connection; no external MCP client setup is needed. To select a trusted service endpoint, use the provider's `mcp_url` or `<SOURCE>_MCP_URL` with the complete URL. Defaults are `https://mcp.exa.ai/mcp`, `https://mcp.parallel.ai/mcp` and `https://mcp.firecrawl.dev/v2/mcp`. Credentials require HTTPS; keyless localhost services may use HTTP. Exa uses its REST API when a key is configured, so its `base_url` applies only to the keyed path.

SearXNG's `base_url` is the instance root and may include a deployment subpath. HTTP is allowed for local instances. Its administrator must enable `json` in `search.formats`. The program does not find or rotate public instances.

### Results and errors

Web results are JSON arrays in upstream order. New web providers return `kind: "web"`, `source`, `title`, `url`, `rank` and `summary` when available. `source` identifies the search engine, not the article publisher. WolframAlpha returns `kind: "answer"`, `answer` and `sections`, without inventing article URLs or timestamps.

`-n` is an upper bound, not a guaranteed count. Brave/Tavily request at most 20 results; Exa, Firecrawl and Keenable request at most 100. Parallel does not expose a result-count request parameter, so its response is truncated to `-n`. No provider automatically paginates. WolframAlpha returns one answer containing multiple sections. Search does not open result pages; pass a result URL to reading mode separately.

Missing credentials affect only that provider. Missing configuration, disabled providers, network errors, access refusals and rate limiting are reported as errors, not empty results. Credentials are not sent to result pages; cross-origin search redirects are refused, and credentials are not logged.

## Requirements

- Node.js ≥26.0.0
- npm

## Installation

```bash
npm ci
make install   # installs web_reader as a global command via npm link
```

`make install` also links `web_reader/` into `~/.claude/skills/web-reader` and `~/.agents/skills/web-reader`. Codex uses the shared `.agents/skills` location. Run `make install-skill` to install only these links. Existing matching links are preserved; conflicting files are never overwritten. Existing installations in `~/.codex/skills/web-reader` or the OpenCode-specific skills directory produce a migration warning and are left untouched; remove obsolete installations yourself to avoid duplicates. Installation does not clear project data.


After `make install`, `web_reader` is available from any directory.

Existing installations can run `git pull` followed by `npm ci` in the repository to reproduce the locked dependencies. nvm is optional; `.nvmrc` selects Node 26 for users who use it.

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
| — | `--config` | — | Select an alternative TOML file for CLI / MCP |
| `-q` | `--query` | — | Search source ID from the tables above; keywords follow |
| `-n` | `--limit` | `50` | Max results |
| `-o` | `--out` | stdout | Write output to FILE |
| `-c` | `--concurrency` | `2` | Parallel sources (list mode) |
| `-l` | `--loglevel` | `warn` | `debug\|info\|warn\|error` |
| `-h` | `--help` | | Show help |


HTTP response headers are limited to 64 KiB per response (including redirects), configured by `CONFIG.HTTP_MAX_HEADER_SIZE` in `src/config.ts`.

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

Exposes three tools: `list_news`, `read_url`, `search`. See `web_reader/SKILL.md` for full AI usage guide.

## Output

News lists and URL-bearing search results include persistent `first_seen_at` and, when confirmed, `published_at`. `occurred_at` (event time) and `written_at` (authoring time) are omitted without explicit evidence. All four fields use `YYYY-MM-DDTHH:mm:ss+08:00` (Beijing time). Date-only values are not padded to midnight; update and repost times are not publication times. Wikipedia's existing `event_date` remains for compatibility.

First observations are stored by normalized URL in `~/.local/share/web-reader/first-seen.sqlite`; set `XDG_DATA_HOME` or `WEB_READER_DATA_DIR` to customize the location. Repeated runs preserve the initial value. The directory must be writable; deleting the database resets observation history, so back it up as needed. Some sources require additional article metadata requests when their lists lack publication times, increasing latency with result count; failures preserve items without a publication timestamp. See [source timestamp support](docs/date-support.md) (Chinese).


Wikipedia lists expose optional `event_date` (YYYY-MM-DD), the calendar day assigned to the event by the portal, not the original article publication time. Missing, invalid, ambiguous or mismatched date metadata leaves this field absent; search results have no event date. Chinese Wikipedia uses the explicit month in its news contribution link and never guesses the year from the system clock.

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
| `make coverage` | c8 includes all production code (`lib.ts`, `read.ts`, `src/**/*.ts`, `plugins/**/*.ts`); each file must reach 51% for lines, statements, functions, and branches; pure type declarations in src/types.ts and src/cli/types.ts are excluded; HTML output: `coverage/index.html` |
| `make complexity` | ESLint cyclomatic complexity ≤9 and SonarJS cognitive complexity ≤14 per function |
| `make maintainability` | Maintainability Index (MI) must exceed 30 for every production source file |
| `make security` | Trivy scans the npm lockfile including dev dependencies, then verifies every locked package/version appears in the report |
| `make quality` | Aggregates these checks with build and lint, running tests and coverage only once |

`make unittest` retains coverage reporting and is equivalent to `make coverage`. Complexity and MI exclude tests, tooling scripts, and generated files. MI follows the reference project's TypeScript AST/token approximation: `max(0, (171 - 5.2*ln(V) - 0.23*C - 16.2*ln(L))*100/171)`, where V is estimated Halstead volume, C is file-level branch complexity, and L counts nonblank lines (including comment lines). Compare scores within this project; other tools may calculate MI differently.

Install [Trivy](https://trivy.dev/docs/latest/getting-started/installation/) separately. Its first run needs network access to download the vulnerability database. Override the executable and report directory with `make security TRIVY=/path/to/trivy SECURITY_REPORT_DIR=tmp/security`. The full JSON report defaults to `tmp/security/source.json` and is ignored by Git. This Node.js project scans its lockfile; the reference project's Go binary scan does not apply.

As in the reference project, reported vulnerabilities alone do not fail `security`. A missing scanner, scan error, invalid report, or missing locked dependency does. A successful scan does not mean there are no vulnerabilities. Production modules are checked individually, including `src/`; no exemptions or relaxed thresholds are applied.

TypeScript is pinned to the latest compatible 6.0.x release: current typescript-eslint and SonarJS require TypeScript <6.1, and the MI script uses its compiler API. The runtime baseline is Node 26, with Node 26 type definitions and a node26 bundle target. jsdom remains on 27.x and Undici on 7.x; raising the runtime baseline does not require upgrading their major versions. Other dependencies retain their security updates.

### Source layout

- `read.ts`: CLI/MCP entry point; `lib.ts`: stable public exports for plugins and integrations.
- `src/cli/`: argument validation, presets, input/output, and the three command modes.
- `src/http/`: request profiles, redirect/encoding handling, and retries.
- `src/feeds/`: shared feed parsing, deduplication, and source-specific data conversion.
- `src/mcp*.ts`: MCP tool registration and handlers; `src/extract.ts`: article extraction.

## Adding a new source

1. Create `plugins/{id}.ts` — export a `Plugin` with `id` and `list()` (see `lib.ts`)
2. Add the ID to `KNOWN_SOURCES` in `src/cli/sources.ts`

## Author

Shell <shell909090@gmail.com>

## License

MIT License  
Copyright © 2026 Shell
