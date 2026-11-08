import { test } from 'node:test';
import assert from 'node:assert/strict';
import plugin from '../plugins/oschina.ts';
import { makeLogger, type Ctx } from '../lib.ts';
const item = {
  source: 'oschina',
  title: '',
  url: 'https://www.oschina.net/news/503469/title',
  notes: '',
};
function context(body: unknown, status = 200): Ctx {
  return {
    mode: 'http',
    log: makeLogger('error'),
    httpGet: async (url, opts) => {
      assert.equal(url, 'https://apiv1.oschina.net/oschinapi/new/detail?id=503469');
      assert.equal(opts?.headers?.Referer, 'https://www.oschina.net/');
      return { status, html: JSON.stringify(body), finalUrl: url };
    },
  };
}
test('OSChina dispatch accepts article paths and rejects unrelated hosts', () => {
  assert.ok(plugin.urlPattern!.test(item.url));
  assert.ok(plugin.urlPattern!.test('https://www.oschina.net/news/503469?x=1'));
  assert.equal(plugin.urlPattern!.test('https://www.oschina.net.evil/news/503469'), false);
});
test('OSChina API renders title and body as Markdown', async () => {
  const md = await plugin.detail!(
    context({
      success: true,
      result: {
        title: 'Release notes',
        detail: `<p>${'A release improves reliability and documents usage. '.repeat(8)}</p><pre><code>npm install example</code></pre>`,
      },
    }),
    item,
  );
  assert.match(md, /^# Release notes/);
  assert.match(md, /npm install example/);
});
test('OSChina errors identify invalid URLs, transport, business and content failures', async () => {
  await assert.rejects(
    plugin.detail!(context({}), { ...item, url: 'https://example.com' }),
    /Invalid OSChina/,
  );
  await assert.rejects(plugin.detail!(context({}, 503), item), /HTTP 503/);
  for (const body of [null, {}, { success: false }, { success: true }])
    await assert.rejects(plugin.detail!(context(body), item), /no article/);
  await assert.rejects(
    plugin.detail!(
      context({ success: true, result: { type: 5, originalUrl: 'https://example.com' } }),
      item,
    ),
    /external redirect/,
  );
  for (const detail of [undefined, '', 42])
    await assert.rejects(
      plugin.detail!(context({ success: true, result: { detail } }), item),
      /empty content/,
    );
  await assert.rejects(
    plugin.detail!(context({ success: true, result: { detail: '<p>Short</p>' } }), item),
    /too short/,
  );
});
test('OSChina tolerates a missing title when body content is valid', async () => {
  const md = await plugin.detail!(
    context({
      success: true,
      result: { detail: `<p>${'Documented release content. '.repeat(20)}</p>` },
    }),
    item,
  );
  assert.match(md, /Documented release/);
});
