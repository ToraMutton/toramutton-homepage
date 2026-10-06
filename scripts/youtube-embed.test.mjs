import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import { compile } from '@mdx-js/mdx';
import remarkGfm from 'remark-gfm';
import remarkLinkCard from 'remark-link-card';
import youtubeEmbeds from '../src/utils/remark-youtube-embed.mjs';

const id = 'M7lc1UVf-VE';
const embedUrl = `https://www.youtube-nocookie.com/embed/${id}`;
const processor = await createMarkdownProcessor({
  remarkPlugins: [youtubeEmbeds],
  syntaxHighlight: false,
});
const render = async (source) => (await processor.render(source)).code;

test('standalone watch, shared and Shorts URLs produce a lazy player', async () => {
  for (const url of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/shorts/${id}/`,
    `http://youtu.be/${id}`,
  ]) {
    const html = await render(`前文\n\n${url}\n\n後文`);
    assert.ok(html.includes(`src="${embedUrl}"`), url);
    assert.match(html, /loading="lazy"/);
    assert.match(html, /referrerpolicy="strict-origin-when-cross-origin"/);
    assert.match(html, /title="YouTube動画プレイヤー"/);
    assert.match(html, /allowfullscreen/);
    assert.match(html, /href="https:\/\/www\.youtube\.com\/watch\?v=M7lc1UVf-VE"/);
    assert.match(html, />YouTubeで見る<\/a>/);
    assert.match(html, /<p>前文<\/p>/);
    assert.match(html, /<p>後文<\/p>/);
  }
});

test('start times are normalized and unrelated parameters are dropped', async () => {
  for (const [suffix, seconds] of [
    ['?t=90', 90],
    ['?t=90s', 90],
    ['?t=1m30s', 90],
    ['?t=1h2m3s', 3723],
    ['?start=90', 90],
    ['#t=1m30s', 90],
    ['?si=shared&t=90&list=PLexample&autoplay=1', 90],
    ['?start=30&t=90', 30],
    ['?t=0', 0],
    ['?t=-10', 0],
    ['?t=invalid', 0],
    ['?t=1.5', 0],
    ['?t=999999999999999999999999', 0],
    ['?autoplay=1&list=PLexample', 0],
  ]) {
    const html = await render(`https://youtu.be/${id}${suffix}`);
    const src = html.match(/<iframe src="([^"]+)"/)[1];
    assert.equal(src, `${embedUrl}${seconds ? `?start=${seconds}` : ''}`, suffix);
    if (seconds) assert.ok(html.includes(`&#x26;t=${seconds}"`), suffix);
    assert.doesNotMatch(html, /autoplay=|list=|si=/);
  }
});

test('prose, explicit links and nested URLs are not embedded', async () => {
  const url = `https://youtu.be/${id}`;
  for (const source of [
    `参考動画: ${url}`,
    `${url} を見てください`,
    `${url}\n説明文`,
    `${url}\n${url}`,
    `[動画を見る](${url})`,
    `[${url}](${url})`,
    `<${url}>`,
    `\`${url}\``,
    `\`\`\`text\n${url}\n\`\`\``,
    `> ${url}`,
    `- ${url}`,
    `| 動画 |\n| --- |\n| ${url} |`,
  ]) {
    assert.doesNotMatch(await render(source), /<iframe|youtube-embed/, source);
  }
  assert.match(await render(`[動画を見る](${url})`), /<a href="[^"]+">動画を見る<\/a>/);
});

test('unsupported or deceptive URLs remain ordinary content', async () => {
  for (const url of [
    'https://youtu.be/short',
    `https://youtu.be/${id}/extra`,
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/playlist?list=PLexample',
    'https://www.youtube.com/@example',
    `https://www.youtube.com.evil.example/watch?v=${id}`,
    `https://youtube.com@evil.example/watch?v=${id}`,
    `https://evil.example@www.youtube.com/watch?v=${id}`,
    `https://www.youtube.com:444/watch?v=${id}`,
    'https://[invalid',
  ]) {
    assert.doesNotMatch(await render(url), /<iframe|youtube-embed/, url);
  }
});

test('YouTube embeds coexist with adjacent link cards', async (t) => {
  let requests = 0;
  const server = createServer((_req, res) => {
    requests++;
    res.writeHead(200, { 'content-type': 'text/html; charset=UTF-8' });
    res.end('<html><head><meta property="og:title" content="Reference page"></head></html>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const withCards = await createMarkdownProcessor({
    remarkPlugins: [youtubeEmbeds, remarkLinkCard],
    syntaxHighlight: false,
  });
  const { code } = await withCards.render(`${base}/before\n\nhttps://youtu.be/${id}\n\n${base}/after`);
  assert.equal(requests, 2);
  assert.equal((code.match(/class="rlc-container"/g) ?? []).length, 2);
  assert.equal((code.match(/<iframe /g) ?? []).length, 1);
  assert.match(code, /Reference page/);
  assert.ok(code.indexOf(`${base}/before`) < code.indexOf(embedUrl));
  assert.ok(code.indexOf(embedUrl) < code.indexOf(`${base}/after`));
});

test('MDX compiles the same bare URL into a player', async () => {
  const output = String(await compile(`https://youtu.be/${id}?t=1m30s`, {
    remarkPlugins: [remarkGfm, youtubeEmbeds, remarkLinkCard],
    jsx: true,
    jsxImportSource: 'astro',
  }));
  assert.ok(output.includes(`src="${embedUrl}?start=90"`));
  assert.match(output, /loading="lazy"/);
  assert.match(output, /YouTubeで見る/);
  assert.doesNotMatch(output, /rlc-container/);
});
