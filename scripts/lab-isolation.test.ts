import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { extractImports, findViolations } from './lab-isolation.mjs';

const roots: string[] = [];

async function repo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'lab-iso-'));
  roots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(root, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
  }
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true })));
});

describe('extractImports', () => {
  it('finds static, multi-line, type, side-effect, dynamic, and re-export specifiers', () => {
    const src = `
      import a from './a';
      import {
        b,
        c as d,
      } from "../b";
      import type { T } from '@lab/meta';
      import './side.css';
      const m = await import('./dyn');
      export * from './re';
      export { x } from './rex';
      const g = import.meta.glob('/src/pages/lab/*/_meta.ts');
    `;
    expect(extractImports(src).sort()).toEqual(
      ['./a', '../b', '@lab/meta', './side.css', './dyn', './re', './rex'].sort(),
    );
  });
});

describe('findViolations', () => {
  it('passes on the real repo', async () => {
    expect(await findViolations(process.cwd())).toEqual([]);
  });

  it('allows own-folder, @lab, and npm imports in a project', async () => {
    const root = await repo({
      'src/pages/lab/a/index.astro': `---\nimport X from './_components/X.astro';\nimport { kv } from '@lab/kv';\nimport confetti from 'canvas-confetti';\n---`,
      'src/pages/lab/a/api/x.ts': `import { thing } from '../_lib/thing';`,
    });
    expect(await findViolations(root)).toEqual([]);
  });

  it('flags cross-project imports', async () => {
    const root = await repo({ 'src/pages/lab/a/index.astro': `---\nimport B from '../b/_components/B.astro';\n---` });
    expect(await findViolations(root)).toEqual([
      expect.objectContaining({ file: 'src/pages/lab/a/index.astro', import: '../b/_components/B.astro' }),
    ]);
  });

  it('flags a project file that escapes via @lab/../ back into portfolio code', async () => {
    const root = await repo({
      'src/pages/lab/a/index.astro': `---\nimport Nav from '@lab/../components/Nav.astro';\n---`,
    });
    expect(await findViolations(root)).toEqual([
      expect.objectContaining({ file: 'src/pages/lab/a/index.astro', import: '@lab/../components/Nav.astro' }),
    ]);
  });

  it('flags a src/lab file that escapes via @lab/../ into a project', async () => {
    const root = await repo({
      'src/lab/bad.ts': `import m from '@lab/../pages/lab/a/_meta';`,
    });
    expect(await findViolations(root)).toEqual([
      expect.objectContaining({ file: 'src/lab/bad.ts', import: '@lab/../pages/lab/a/_meta' }),
    ]);
  });

  it('flags portfolio imports from a project', async () => {
    const root = await repo({
      'src/pages/lab/a/index.astro': `---\nimport Nav from '@/components/Nav.astro';\n---`,
      'src/pages/lab/a/x.ts': `import { f } from '../../../lib/slug';`,
    });
    const v = await findViolations(root);
    expect(v.map((x) => x.import).sort()).toEqual(['../../../lib/slug', '@/components/Nav.astro']);
  });

  it('allows shared space to use itself, npm, and the BaseLayout/global.css bridge', async () => {
    const root = await repo({
      'src/lab/LabLayout.astro': `---\nimport BaseLayout from '../layouts/BaseLayout.astro';\nimport { siteUrl } from './url';\n---`,
      'src/lab/x.ts': `import '@/styles/global.css';\nimport { Redis } from '@upstash/redis';`,
    });
    expect(await findViolations(root)).toEqual([]);
  });

  it('flags shared space importing projects or other portfolio code', async () => {
    const root = await repo({
      'src/lab/bad.ts': `import m from '../pages/lab/a/_meta';\nimport N from '@/components/Nav.astro';`,
    });
    expect((await findViolations(root)).map((x) => x.import).sort()).toEqual([
      '../pages/lab/a/_meta',
      '@/components/Nav.astro',
    ]);
  });

  it('only lets the /lab index page import @lab from portfolio code', async () => {
    const root = await repo({
      'src/pages/lab/index.astro': `---\nimport { projects } from '@lab/registry';\n---`,
      'src/pages/about.astro': `---\nimport { siteUrl } from '@lab/url';\n---`,
    });
    expect(await findViolations(root)).toEqual([
      expect.objectContaining({ file: 'src/pages/about.astro', import: '@lab/url' }),
    ]);
  });

  it('also lets the og card endpoint import @lab from portfolio code, but not other pages', async () => {
    const root = await repo({
      'src/pages/og/[...slug].png.ts': `import { projects } from '@lab/registry';`,
      'src/pages/other.ts': `import { siteUrl } from '@lab/url';`,
    });
    expect(await findViolations(root)).toEqual([
      expect.objectContaining({ file: 'src/pages/other.ts', import: '@lab/url' }),
    ]);
  });
});
