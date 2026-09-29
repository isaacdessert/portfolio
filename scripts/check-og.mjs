// Post-build guard: every prerendered page must have an og:image that actually resolves to a
// file in the static output dir, so shared links always get a working preview card. Runs after
// `astro build` + scripts/vercel-routes.mjs (see package.json's build script).
import { readdir, readFile, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OG_IMAGE_RE =
  /<meta\s+(?:[^>]*?\s)?property=["']og:image["'][^>]*?\scontent=["']([^"']+)["'][^>]*>|<meta\s+(?:[^>]*?\s)?content=["']([^"']+)["'][^>]*?\sproperty=["']og:image["'][^>]*>/i;

/** @param {string} html @returns {string | null} */
export function extractOgImage(html) {
  const match = html.match(OG_IMAGE_RE);
  if (!match) return null;
  return match[1] ?? match[2] ?? null;
}

/** @param {string} dir @returns {Promise<string[]>} absolute paths of every .html file under dir */
async function walkHtml(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true, recursive: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.html'))
    .map((e) => path.join(e.parentPath ?? e.path, e.name));
}

/**
 * Scans every .html file under outDir, extracts its og:image content, and reports any whose
 * URL path doesn't map to a file that exists in outDir.
 * @param {string} outDir
 * @returns {Promise<{ file: string; image: string }[]>}
 */
export async function findMissingOgImages(outDir) {
  const missing = [];
  for (const absHtmlFile of await walkHtml(outDir)) {
    const html = await readFile(absHtmlFile, 'utf8');
    const ogImage = extractOgImage(html);
    if (!ogImage) continue;

    let pathname;
    try {
      pathname = new URL(ogImage).pathname;
    } catch {
      pathname = ogImage.startsWith('/') ? ogImage : `/${ogImage}`;
    }

    const imagePath = path.join(outDir, pathname);
    try {
      await access(imagePath);
    } catch {
      missing.push({ file: path.relative(outDir, absHtmlFile), image: pathname });
    }
  }
  return missing;
}

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const candidates = ['.vercel/output/static', 'dist/client'];
  const outDir = candidates.map((c) => path.join(REPO_ROOT, c)).find((c) => existsSync(c));

  if (!outDir) {
    console.error(
      `check-og: no static output dir found (checked ${candidates.join(', ')}) — run the build first`,
    );
    process.exit(1);
  }

  const missing = await findMissingOgImages(outDir);
  if (missing.length > 0) {
    console.error(`check-og: ${missing.length} page(s) reference a missing og:image:`);
    for (const { file, image } of missing) console.error(`  ${file} -> ${image}`);
    process.exit(1);
  }

  console.log(`check-og: all og:image references resolve to a file (${path.relative(REPO_ROOT, outDir)})`);
}
