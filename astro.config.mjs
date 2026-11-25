// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';
import { defineConfig } from 'astro/config';
import responsiveMarkdownImages from './src/utils/rehype-responsive-images.mjs';
import youtubeEmbeds from './src/utils/remark-youtube-embed.mjs';

// @ts-ignore
import remarkLinkCard from 'remark-link-card';

// https://astro.build/config
export default defineConfig({
	site: 'https://toramutton.me',
	output: 'server',
	// /works ページはトップの Works セクションに統合した。古いリンクはそこへ飛ばす
	redirects: {
		'/works': '/#works',
	},
	adapter: vercel(),
	// /retro 配下は通常ページと内容がかぶる遊びのページ、/reconnect は 404 のミニゲームの共有用なので、sitemap には載せない
	integrations: [
		mdx(),
		sitemap({ filter: (page) => !/^\/(retro|reconnect)/.test(new URL(page).pathname) }),
	],
	image: {
		layout: 'constrained',
		// 既存の CSS が画像の表示・切り抜きを担当する。
		responsiveStyles: false,
	},
	markdown: {
		remarkPlugins: [youtubeEmbeds, remarkLinkCard],
		rehypePlugins: [responsiveMarkdownImages],
	},
});
