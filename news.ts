// CLI entry point. Full implementation in T06; this skeleton prints usage.

const USAGE = `
Usage: npx tsx news.ts [options]

Options:
  --sources <ids|all>    Comma-separated source IDs or "all"
                         Available: hn, bbc, techcrunch, sina, reuters, cnbc-ai
  --mode list|detail     Fetch mode (default: list)
  --limit N              Max articles per source (default: 20)
  --out DIR              Output directory (default: data/news/)
  --concurrency N        Parallel sources (default: 2)
  --debug                Enable debug logging
  --help                 Show this help

Examples:
  npx tsx news.ts --sources hn --mode list --limit 10
  npx tsx news.ts --sources bbc --mode detail --limit 3
  npx tsx news.ts --sources all --mode list
`.trim();

process.stdout.write(USAGE + '\n');
