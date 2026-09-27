#!/usr/bin/env node
// Usage: npm run new <slug> [-- --api]
import { cp, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugError } from '../src/lab/slug-rules.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @param {string} slug */
export function titleCase(slug) {
  return slug
    .split('-')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

/** @param {string} slug */
export function envPrefix(slug) {
  return slug.toUpperCase().replaceAll('-', '_');
}

/** Local-time YYYY-MM-DD. */
function localToday() {
  return new Date().toLocaleDateString('en-CA');
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile()).map((e) => path.join(e.parentPath ?? e.path, e.name));
}

/**
 * @param {{ slug: string, api?: boolean, root?: string, today?: string }} options
 * @returns {Promise<string>} the created project directory
 */
export async function scaffold({ slug, api = false, root = REPO_ROOT, today = localToday() }) {
  const problem = slugError(slug);
  if (problem) throw new Error(problem);

  const dest = path.join(root, 'src/pages/lab', slug);
  if (existsSync(dest)) throw new Error(`src/pages/lab/${slug} already exists`);

  for (const layer of ['basic', ...(api ? ['api'] : [])]) {
    await cp(path.join(root, 'templates/lab', layer), dest, { recursive: true });
  }

  const replacements = {
    __SLUG__: slug,
    __TITLE__: titleCase(slug),
    __DATE__: today,
    __ENV_PREFIX__: envPrefix(slug),
  };
  for (const file of await listFiles(dest)) {
    let content = await readFile(file, 'utf8');
    for (const [token, value] of Object.entries(replacements)) content = content.replaceAll(token, value);
    await writeFile(file, content);
  }
  return dest;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const args = process.argv.slice(2);
  const slug = args.find((a) => !a.startsWith('-'));
  const api = args.includes('--api');
  try {
    const dir = await scaffold({ slug, api });
    console.log(`\n  Created ${path.relative(REPO_ROOT, dir)}/${api ? ' (with API route)' : ''}`);
    console.log(`\n  npm run dev  →  http://localhost:4321/lab/${slug}/`);
    console.log(`  Edit _meta.ts (description, tags); set status: 'live' when ready.\n`);
  } catch (err) {
    console.error(`\n  ${err.message}\n\n  Usage: npm run new <slug> [-- --api]\n`);
    process.exit(1);
  }
}
