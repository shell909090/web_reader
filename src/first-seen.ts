import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { Item } from './types.ts';
import { beijingTime } from './timestamps.ts';

/** Normalize fragment and tracking variations without dropping article identity parameters. */
export function newsIdentity(raw: string): string {
  const url = new URL(raw);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_/i.test(key) || ['fbclid', 'gclid'].includes(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.href;
}

/** Persist first observations atomically across processes before emitting news items. */
export function recordFirstSeen(items: Item[], directory = defaultDirectory()): void {
  if (!items.length) return;
  const path = join(directory, 'first-seen.sqlite');
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    db.exec(
      'PRAGMA busy_timeout = 5000; CREATE TABLE IF NOT EXISTS seen (url TEXT PRIMARY KEY, at TEXT NOT NULL)',
    );
    db.exec('BEGIN IMMEDIATE');
    const insert = db.prepare('INSERT OR IGNORE INTO seen (url, at) VALUES (?, ?)');
    const select = db.prepare('SELECT at FROM seen WHERE url = ?');
    const now = beijingTime(Date.now());
    for (const item of items) {
      const key = newsIdentity(item.url);
      insert.run(key, now);
      item.first_seen_at = String(select.get(key)!.at);
    }
    db.exec('COMMIT');
  } finally {
    db.close();
  }
}

function defaultDirectory(): string {
  return (
    process.env.WEB_READER_DATA_DIR ??
    join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'web-reader')
  );
}
