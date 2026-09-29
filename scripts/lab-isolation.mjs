// Enforces lab isolation (see docs/superpowers/specs/2026-09-26-lab-platform-design.md §1):
// - projects (src/pages/lab/<slug>/) import only their own folder, @lab/*, npm
// - shared space (src/lab/) imports only itself, npm, BaseLayout, global.css
// - portfolio code imports @lab/* only from src/pages/lab/index.astro or the og card
//   endpoint (src/pages/og/[...slug].png.ts), which reads project metadata for OG cards
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.astro', '.svelte', '.vue']);
const SHARED = 'src/lab/';
const PROJECTS = 'src/pages/lab/';
const LAB_INDEX = 'src/pages/lab/index.astro';
const OG_ENDPOINT = 'src/pages/og/[...slug].png.ts';
const ALLOWED_LAB_READERS = new Set([LAB_INDEX, OG_ENDPOINT]);
const BRIDGE = new Set(['src/layouts/BaseLayout.astro', 'src/styles/global.css']);

const IMPORT_PATTERNS = [
  /\b(?:import|export)\s+(?:type\s+)?[\w*{}\s,$]*?\s*from\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/** @param {string} source @returns {string[]} */
export function extractImports(source) {
  const found = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of source.matchAll(pattern)) found.add(match[1]);
  }
  return [...found];
}

/** @param {string} dir @returns {Promise<string[]>} */
async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true, recursive: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && EXTENSIONS.has(path.extname(e.name)))
    .map((e) => path.join(e.parentPath ?? e.path, e.name));
}

const toPosix = (p) => p.split(path.sep).join('/');

/** Repo-relative target of an import, or null for npm packages / virtual modules. */
function targetOf(root, file, spec) {
  if (spec.startsWith('.')) return toPosix(path.relative(root, path.resolve(path.dirname(file), spec)));
  if (spec.startsWith('@lab/')) return path.posix.normalize(SHARED + spec.slice('@lab/'.length));
  if (spec.startsWith('@/')) return path.posix.normalize('src/' + spec.slice(2));
  if (spec.startsWith('/')) return path.posix.normalize(spec.slice(1));
  return null;
}

function checkProject(target, projectDir) {
  if (target === null || target.startsWith(projectDir) || target.startsWith(SHARED)) return null;
  return 'Projects may only import from their own folder, @lab/*, or npm packages';
}

function checkShared(target) {
  if (target === null || target.startsWith(SHARED) || BRIDGE.has(target)) return null;
  return 'src/lab may only import from src/lab, npm packages, BaseLayout.astro, or global.css';
}

function checkPortfolio(target, file) {
  if (target !== null && target.startsWith(SHARED) && !ALLOWED_LAB_READERS.has(file)) {
    return 'Only src/pages/lab/index.astro or src/pages/og/[...slug].png.ts may import from @lab/*';
  }
  return null;
}

/** @param {string} root */
export async function findViolations(root) {
  const violations = [];
  for (const abs of await walk(path.join(root, 'src'))) {
    const file = toPosix(path.relative(root, abs));
    const source = await readFile(abs, 'utf8');

    let check;
    if (file.startsWith(SHARED)) {
      check = (target) => checkShared(target);
    } else if (file.startsWith(PROJECTS) && file.slice(PROJECTS.length).includes('/')) {
      const slug = file.slice(PROJECTS.length).split('/')[0];
      check = (target) => checkProject(target, `${PROJECTS}${slug}/`);
    } else {
      check = (target) => checkPortfolio(target, file);
    }

    for (const spec of extractImports(source)) {
      const reason = check(targetOf(root, abs, spec));
      if (reason) violations.push({ file, import: spec, reason });
    }
  }
  return violations;
}
