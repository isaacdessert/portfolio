// Adds the lab subdomain rewrite to the Vercel Build Output config, ahead of the
// filesystem check. vercel.json rewrites can't do this: they run after static files
// match (so hello.isaacdessert.dev/ would serve the homepage), and the Astro adapter
// writes .vercel/output/config.json itself. Runs after `astro build` (see package.json).
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LAB_SUBDOMAIN_ROUTE = {
  src: '^/((?!_astro/|_image|_server-islands/|_vercel/|lab/|favicon\\.svg).*)$',
  has: [{ type: 'host', value: '(?<slug>(?!www\\.)[a-z0-9-]+)\\.isaacdessert\\.dev' }],
  dest: '/lab/$slug/$1',
};

/** Returns a new config with LAB_SUBDOMAIN_ROUTE inserted just before the filesystem handle. Idempotent. */
export function addLabRoute(config) {
  const routes = [...(config.routes ?? [])];
  if (routes.some((r) => r.dest === LAB_SUBDOMAIN_ROUTE.dest && r.src === LAB_SUBDOMAIN_ROUTE.src)) return config;
  const fs = routes.findIndex((r) => r.handle === 'filesystem');
  if (fs === -1) throw new Error('vercel-routes: no { handle: "filesystem" } in .vercel/output/config.json');
  routes.splice(fs, 0, LAB_SUBDOMAIN_ROUTE);
  return { ...config, routes };
}

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const file = path.join(REPO_ROOT, '.vercel/output/config.json');
  const config = JSON.parse(await readFile(file, 'utf8'));
  await writeFile(file, JSON.stringify(addLabRoute(config), null, 2));
  console.log('vercel-routes: lab subdomain route inserted before filesystem');
}
