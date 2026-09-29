import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { unlistedLabPaths } from './unlisted-lab.mjs';

const roots: string[] = [];

async function repo(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'unlisted-lab-'));
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

describe('unlistedLabPaths', () => {
  it('returns only the unlisted project as a /lab/<slug>/ path prefix', async () => {
    const root = await repo({
      'src/pages/lab/a/_meta.ts': `export default { status: 'live' };`,
      'src/pages/lab/b/_meta.ts': `export default { status: 'unlisted' };`,
      'src/pages/lab/c/index.astro': `<p>no meta</p>`,
    });
    expect(unlistedLabPaths(root)).toEqual(['/lab/b/']);
  });

  it('returns [] when src/pages/lab is missing', async () => {
    const root = await repo({ 'README.md': 'no lab dir here' });
    expect(unlistedLabPaths(root)).toEqual([]);
  });

  it('returns [] on the real repo (no unlisted projects)', () => {
    expect(unlistedLabPaths(process.cwd())).toEqual([]);
  });
});
