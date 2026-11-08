import type { CheerioAPI } from 'cheerio';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Validate a calendar date without changing its timezone or guessing missing parts. */
export function calendarDate(year: number, month: number, day: number): string | undefined {
  const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? undefined
    : value;
}

/** Read the English portal's explicit daily container date. */
export function englishEventDate(id: string): string | undefined {
  const match = /^(\d{4})_([A-Za-z]+)_(\d{1,2})$/.exec(id);
  return match
    ? calendarDate(Number(match[1]), MONTHS.indexOf(match[2]) + 1, Number(match[3]))
    : undefined;
}

/** Read an unambiguous month from the portal's news contribution link. */
export function chineseNewsMonth($: CheerioAPI): string | undefined {
  const months = new Set<string>();
  $('#mw-content-text a[href]').each((_i, el) => {
    const href = $(el).attr('href')!;
    if (!URL.canParse(href, 'https://zh.wikipedia.org')) return;
    const url = new URL(href, 'https://zh.wikipedia.org');
    if (
      url.origin !== 'https://zh.wikipedia.org' ||
      url.pathname !== '/w/index.php' ||
      url.searchParams.get('action') !== 'edit' ||
      url.searchParams.has('redlink')
    )
      return;
    const title = url.searchParams.get('title') ?? '';
    if (/^\d{4}年\d{1,2}月$/.test(title)) months.add(title);
  });
  return months.size === 1 ? [...months][0] : undefined;
}

/** Combine matching portal month metadata and day headings without rollover guesses. */
export function chineseEventDate(heading: string, month: string | undefined): string | undefined {
  const day = /^(\d{1,2})月(\d{1,2})日$/.exec(heading);
  const context = /^(\d{4})年(\d{1,2})月$/.exec(month ?? '');
  if (!day || !context || Number(day[1]) !== Number(context[2])) return undefined;
  return calendarDate(Number(context[1]), Number(context[2]), Number(day[2]));
}
