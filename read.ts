// CLI and MCP entry point.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { CONFIG, setActiveProfile, makeLogger } from './lib.ts';
import { parseCLI } from './src/cli/args.ts';
import { USAGE } from './src/cli/usage.ts';
import { runQuery } from './src/cli/query.ts';
import { runList } from './src/cli/list.ts';
import { runDetail } from './src/cli/detail.ts';
import { startMcp } from './src/mcp.ts';
export { startMcp };

/** Main entry point; returns exit code. */
export async function main(argv: string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE + '\n');
    return 0;
  }
  const timeout = setTimeout(() => {
    process.stderr.write('[ERROR] Total timeout exceeded\n');
    process.exit(4);
  }, CONFIG.TOTAL_TIMEOUT_MS);
  timeout.unref();
  try {
    const args = parseCLI(argv);
    if (!args) {
      process.stderr.write(USAGE + '\n');
      return 2;
    }
    setActiveProfile(args.profile);
    const log = makeLogger(args.loglevel);
    switch (args.mode) {
      case 'query':
        return await runQuery(args, log);
      case 'list':
        return await runList(args, log);
      case 'detail':
        return await runDetail(args, log);
    }
  } finally {
    clearTimeout(timeout);
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const isMcp = process.argv.includes('--mcp');
  if (isMcp) {
    startMcp().catch((err) => {
      process.stderr.write(`[FATAL] ${err}\n`);
      process.exit(1);
    });
  } else {
    main(process.argv.slice(2))
      .then((code) => process.exit(code))
      .catch((err) => {
        process.stderr.write(`[FATAL] ${err}\n`);
        process.exit(1);
      });
  }
}
