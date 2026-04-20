import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  // Update this to match your GitHub repo name.
  // If your repo is "isaacdessert.github.io", set base: '/'
  // If your repo is "portfolio", set base: '/portfolio'
  site: 'https://isaac-dessert-portfolio.vercel.app',
  base: '/',
  integrations: [tailwind()],
  output: 'static',
});
