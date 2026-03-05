// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

// @ts-ignore
import remarkLinkCard from 'remark-link-card';

// https://astro.build/config
export default defineConfig({
	site: 'https://toramutton.me',
	integrations: [mdx(), sitemap()],
	markdown: {
		remarkPlugins: [remarkLinkCard],
	},
});
