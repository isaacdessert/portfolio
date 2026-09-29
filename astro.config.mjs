import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';
import { unlistedLabPaths } from './scripts/unlisted-lab.mjs';

const unlisted = unlistedLabPaths();

export default defineConfig({
  site: 'https://isaacdessert.dev',
  integrations: [
    tailwind(),
    sitemap({ filter: (page) => !unlisted.some((p) => new URL(page).pathname.startsWith(p)) }),
  ],
  // Static by default. Any page or endpoint that exports
  // `const prerender = false` becomes a Vercel serverless function.
  output: 'static',
  adapter: vercel(),
});
