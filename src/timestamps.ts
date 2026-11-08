/** Format an instant as second-precision Beijing time. */
export function beijingTime(milliseconds: number): string {
  return new Date(milliseconds + 8 * 60 * 60 * 1000).toISOString().slice(0, 19) + '+08:00';
}

/** Normalize explicit ISO/RSS instants; never infer a timezone or midnight. */
export function newsTime(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  const iso =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.exec(text);
  if (iso) return isoTime(iso);
  return rssTime(text);
}

function isoTime(parts: RegExpExecArray): string | undefined {
  const [, day, hour, minute, second = '00', offset] = parts;
  const local = `${day}T${hour}:${minute}:${second}`;
  const check = Date.parse(local + 'Z');
  if (!Number.isFinite(check) || new Date(check).toISOString().slice(0, 19) !== local)
    return undefined;
  const normalized = offset.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const ms = Date.parse(local + normalized);
  return Number.isFinite(ms) ? beijingTime(ms) : undefined;
}

function rssTime(text: string): string | undefined {
  const parts =
    /^(?:[A-Za-z]{3},\s*)?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}:\d{2}(?::\d{2})?)\s+(GMT|UT|[+-]\d{4})$/i.exec(
      text,
    );
  if (!parts) return undefined;
  const [, day, name, year, time, zone] = parts;
  const month =
    ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(
      name.toLowerCase(),
    ) + 1;
  const offset = /^(GMT|UT)$/i.test(zone) ? 'Z' : zone;
  return newsTime(
    `${year}-${String(month).padStart(2, '0')}-${day.padStart(2, '0')}T${time}${offset}`,
  );
}
