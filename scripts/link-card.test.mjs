import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import remarkLinkCard from 'remark-link-card';

const require = createRequire(import.meta.url);
const requireFromPlugin = createRequire(require.resolve('remark-link-card'));
const ogs = requireFromPlugin('open-graph-scraper');
const he = requireFromPlugin('he');
const requireFromScraper = createRequire(requireFromPlugin.resolve('open-graph-scraper'));
const iconv = requireFromScraper('iconv-lite');

test('link cards survive network failures and preserve metadata', async (t) => {
  const requests = new Map();
  const html = '<html><head><meta property="og:title" content="日本語のタイトル"><meta property="og:description" content="記事の説明"><meta property="og:image" content="https://example.com/cover.jpg"></head><body></body></html>';
  const server = createServer((req, res) => {
    requests.set(req.url, (requests.get(req.url) ?? 0) + 1);
    if (req.url === '/missing') {
      res.writeHead(404, { 'content-type': 'text/html' });
      res.end('Not found');
    } else if (req.url === '/stalled' || req.url === '/disconnected') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.write('<html><head>');
      if (req.url === '/disconnected') setTimeout(() => res.destroy(), 10);
    } else {
      const encoding = req.url === '/shift-jis' ? 'Shift_JIS' : 'UTF-8';
      res.writeHead(200, { 'content-type': `text/html; charset=${encoding}` });
      res.end(iconv.encode(html, encoding));
    }
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  await t.test('body timeout rejects once, without a late retry crash', async () => {
    await assert.rejects(
      ogs({ url: `${base}/stalled`, timeout: 100 }),
      (error) => /timeout|aborted/i.test(error.result.error),
    );
    // The previous client could schedule an uncaught retry after rejecting.
    await delay(1500);
    assert.equal(requests.get('/stalled'), 1);
    const { result } = await ogs({ url: `${base}/ok` });
    assert.equal(result.ogTitle, '日本語のタイトル');
  });

  await t.test('large downloads still stop at the configured limit', async () => {
    await assert.rejects(
      ogs({ url: `${base}/ok`, downloadLimit: 20 }),
      (error) => /download limit/.test(error.result.error),
    );
  });

  const makeCard = async (url) => {
    const tree = {
      type: 'root',
      children: [{ type: 'paragraph', children: [{ type: 'text', value: url }] }],
    };
    await remarkLinkCard()(tree);
    return tree.children[0].value;
  };

  await t.test('HTTP and connection errors fall back to a usable card', async () => {
    const messages = [];
    t.mock.method(console, 'error', (message) => messages.push(message));
    for (const path of ['/missing', '/disconnected']) {
      const card = await makeCard(`${base}${path}`);
      assert.match(card, /class="rlc-container"/);
      assert.ok(card.includes(`href="${base}${path}"`));
      assert.match(card, /class="rlc-title">127\.0\.0\.1<\/div>/);
    }
    assert.equal(messages.length, 2);
  });

  await t.test('successful cards retain Japanese text and OGP images', async () => {
    for (const path of ['/ok', '/shift-jis']) {
      const card = await makeCard(`${base}${path}`);
      const decoded = he.decode(card);
      assert.ok(decoded.includes('class="rlc-title">日本語のタイトル</div>'));
      assert.ok(decoded.includes('class="rlc-description">記事の説明</div>'));
      assert.ok(card.includes('src="https://example.com/cover.jpg"'));
    }
  });
});
