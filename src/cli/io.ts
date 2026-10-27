import { writeFile } from 'node:fs/promises';

export function logError(info: {
  source: string;
  url?: string;
  stage: string;
  err: unknown;
}): void {
  const msg = info.err instanceof Error ? info.err.message : String(info.err);
  process.stderr.write(`[ERR] ${info.source}${info.url ? ' ' + info.url : ''}: ${msg}\n`);
}
export async function readStdinLines(): Promise<string[]> {
  if (process.stdin.isTTY) return [];
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks)
    .toString('utf-8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

export async function writeOutput(out: string | null, content: string): Promise<void> {
  if (out) await writeFile(out, content, 'utf-8');
  else process.stdout.write(content);
}
