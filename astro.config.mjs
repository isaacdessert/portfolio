import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://isaacdessert.dev',
  base: '/',
  integrations: [tailwind()],
  // Static by default. Any page or endpoint that exports
  // `const prerender = false` becomes a Vercel serverless function.
  output: 'static',
  adapter: vercel(),
});
