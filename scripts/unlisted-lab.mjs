// Lab projects marked `status: 'unlisted'` in their _meta.ts must stay out of the sitemap
// (they're reachable but hidden + noindex). Used by astro.config.mjs; import.meta.glob isn't
// available there, so this reads the files directly.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** @returns {string[]} path prefixes like "/lab/secret/" */
export function unlistedLabPaths(root = process.cwd()) {
  const labDir = path.join(root, 'src/pages/lab');
  if (!existsSync(labDir)) return [];
  return readdirSync(labDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => {
      const meta = path.join(labDir, d.name, '_meta.ts');
      return existsSync(meta) && /status:\s*['"]unlisted['"]/.test(readFileSync(meta, 'utf8'));
    })
    .map((d) => `/lab/${d.name}/`);
}
