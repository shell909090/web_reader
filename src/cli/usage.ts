import { CONFIG, PROFILE_NAMES } from '../../lib.ts';

export const USAGE = `\
Usage:
  list mode:   npx tsx read.ts -s <ids|all> [options]
  detail mode: npx tsx read.ts <url…>
               npx tsx read.ts -s hn | jq -r '.[].url' | npx tsx read.ts
  query mode:  npx tsx read.ts -q wiki <keywords…>

  Mode is inferred: -s → list, -q → query, otherwise → detail.

Options:
  -s, --sources <ids|all>  Comma-separated source IDs, set names, or "all"
                           Presets: news (bbc+nytimes+xinhua+thepaper)
                                    tech (hn+ars+mittr+infoq)
                                    fin  (caixin+yahoo+cnbc:markets)
                           Categories: reddit:ml/llm/ai/tech/prog/investing/stocks/worldnews
                                       cnbc:top/world/markets/tech/finance/us/health/politics/intl/ai
                                       mittr:ai/computing/space/biotech (default: main RSS)
                                       xinhua:politics/world/society/finance/tech/mil/legal/health/edu
                                       gnews:tech/business/science/health/sports/entertainment/world/nation (default: top)
                           Others: hn bbc techcrunch sina ars theverge infoq people csdn
                                   caixin yahoo wiki nytimes hf oschina juejin gnews bsky
                                   polymarket
                           bsky: bsky:news/tech (default: all; search: -q bsky <keywords>)
  -q, --query SOURCE       Query a data source; keywords follow as positional args
                           Searchable sources: wiki (EN), zhwiki (中文), reddit, gnews, bsky, hf
  -n, --limit N            Max results (default: ${CONFIG.DEFAULT_LIMIT})
  -o, --out FILE           Write output to FILE instead of stdout
  -c, --concurrency N      [list] Parallel sources (default: ${CONFIG.DEFAULT_CONCURRENCY})
  -l, --loglevel LEVEL     Log verbosity: debug|info|warn|error (default: warn)
  -p, --profile PROFILE    HTTP request profile: ${PROFILE_NAMES.join('|')} (default: default)
  -h, --help               Show this help

Examples:
  npx tsx read.ts -s news
  npx tsx read.ts -s tech -n 30
  npx tsx read.ts -s fin -o fin.json
  npx tsx read.ts https://arstechnica.com/tech/2026/05/article
  npx tsx read.ts -q wiki transformer architecture
  npx tsx read.ts -q wiki large language models | jq -r '.[0].url' | npx tsx read.ts`;
