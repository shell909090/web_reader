import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cheerio from 'cheerio';
import {
  calendarDate,
  englishEventDate,
  chineseNewsMonth,
  chineseEventDate,
} from '../src/feeds/wiki-date.ts';
import wiki from '../plugins/wiki.ts';
import zhwiki from '../plugins/zhwiki.ts';
import { makeLogger } from '../lib.ts';

test('event dates validate leap years and explicit years across calendar boundaries', () => {
  assert.equal(englishEventDate('2024_February_29'), '2024-02-29');
  assert.equal(englishEventDate('2025_February_29'), undefined);
  assert.equal(englishEventDate('2026_Unknown_8'), undefined);
  assert.equal(englishEventDate('November 8'), undefined);
  assert.equal(calendarDate(2026, 13, 1), undefined);
  assert.equal(chineseEventDate('12月31日', '2025年12月'), '2025-12-31');
  assert.equal(chineseEventDate('1月1日', '2026年1月'), '2026-01-01');
  for (const [day, month] of [
    ['12月31日', '2026年1月'],
    ['2月30日', '2026年2月'],
    ['参考资料', '2026年1月'],
    ['1月1日', undefined],
  ]) {
    assert.equal(chineseEventDate(day!, month), undefined);
  }
});

function monthLink(title: string): string {
  return `<a href="/w/index.php?title=${encodeURIComponent(title)}&amp;action=edit">Contribute</a>`;
}

test('Chinese month requires unambiguous local contribution metadata', () => {
  const parse = (html: string): string | undefined =>
    chineseNewsMonth(cheerio.load(`<div id="mw-content-text">${html}</div>`));
  assert.equal(parse(monthLink('2026年11月')), '2026年11月');
  assert.equal(
    parse(
      monthLink('2026年11月') +
        '<a href="/w/index.php?title=2026年12月&amp;action=edit&amp;redlink=1">12月</a>',
    ),
    '2026年11月',
  );
  assert.equal(parse(monthLink('2026年11月').repeat(2)), '2026年11月');
  assert.equal(parse(monthLink('2026年11月') + monthLink('2025年12月')), undefined);
  assert.equal(
    parse(
      '<a href="https://evil.test/w/index.php?title=2026年11月&action=edit">External</a><a href="http://[">Bad</a><a href="/wiki/2026年11月">Archive</a>',
    ),
    undefined,
  );
  assert.equal(parse(monthLink('Unrelated')), undefined);
});

test('both plugins expose event dates without claiming publication time', async () => {
  const cases = [
    {
      plugin: wiki,
      html: '<div class="current-events-main" id="2026_November_8" aria-label="November 8"><div class="current-events-content"><ul><li><a href="/wiki/Japan">Japan</a></li></ul></div></div>',
    },
    {
      plugin: zhwiki,
      html: `<div id="mw-content-text">${monthLink('2026年11月')}<h2>11月8日</h2><ul><li><a href="/wiki/Japan">日本</a>新闻</li></ul><h2>参考资料</h2><ul><li><a href="/wiki/China">中国</a></li></ul></div>`,
    },
  ];
  for (const { plugin, html } of cases) {
    const items = await plugin.list(
      {
        mode: 'http',
        log: makeLogger('error'),
        httpGet: async () => ({ status: 200, html, finalUrl: '' }),
      },
      { limit: 5 },
    );
    assert.equal(items.length, 1);
    assert.equal(items[0].event_date, '2026-11-08');
    assert.equal(items[0].published_at, undefined);
  }
});
