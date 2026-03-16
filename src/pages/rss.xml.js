import { getCollection } from 'astro:content';
import rss from '@astrojs/rss';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';

export const prerender = true;

import rssParser from 'rss-parser';

export async function GET(context) {
	const posts = await getCollection('blog');
	const localItems = posts.map((post) => ({
		...post.data,
		link: `/blog/${post.id}/`,
	}));

	const isDev = import.meta.env.DEV;

	const parser = new rssParser();
	let externalItems = [];

	if (!isDev) {
		try {
			const zennFeed = await parser.parseURL(`https://zenn.dev/toramutton/feed?t=${Date.now()}`);
			const zennItems = zennFeed.items.map((item) => ({
				title: item.title,
				pubDate: new Date(item.pubDate),
				description: item.contentSnippet || item.title,
				link: item.link,
			}));
			externalItems.push(...zennItems);
		} catch (e) {
			console.error("Zenn RSS fetch failed in rss.xml.js", e);
		}

		try {
			const qiitaFeed = await parser.parseURL(`https://qiita.com/ToraMutton/feed?t=${Date.now()}`);
			const qiitaItems = qiitaFeed.items.map((item) => ({
				title: item.title,
				pubDate: new Date(item.pubDate),
				description: item.contentSnippet || item.title,
				link: item.link,
			}));
			externalItems.push(...qiitaItems);
		} catch (e) {
			console.error("Qiita RSS fetch failed in rss.xml.js", e);
		}

		try {
			const noteFeed = await parser.parseURL(`https://note.com/toramutton/rss?t=${Date.now()}`);
			const noteItems = noteFeed.items.map((item) => ({
				title: item.title,
				pubDate: new Date(item.pubDate),
				description: item.contentSnippet || item.title,
				link: item.link,
			}));
			externalItems.push(...noteItems);
		} catch (e) {
			console.error("Note RSS fetch failed in rss.xml.js", e);
		}
	}

	const allItems = [...localItems, ...externalItems].sort(
		(a, b) => b.pubDate.valueOf() - a.pubDate.valueOf()
	);

	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site,
		items: allItems,
	});
}
