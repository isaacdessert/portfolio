import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';
import { unlistedLabPaths } from './scripts/unlisted-lab.mjs';

const unlisted = unlistedLabPaths();

export default defineConfig({
  site: 'https://isaacdessert.dev',
  integrations: [
    sitemap({ filter: (page) => !unlisted.some((p) => new URL(page).pathname.startsWith(p)) }),
  ],
  // Static by default. Any page or endpoint that exports
  // `const prerender = false` becomes a Vercel serverless function.
  output: 'static',
  adapter: vercel(),
  // Astro 7 defaults to 'jsx' whitespace stripping; true preserves pre-upgrade spacing.
  compressHTML: true,
  // Vite 7+ targets baseline-widely-available (Lightning CSS emits range media queries);
  // keep the Vite 6 default so older Safari still gets min-width breakpoints.
  vite: {
    build: { cssTarget: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'] },
  },
});
