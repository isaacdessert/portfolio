import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, cp, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scaffold, titleCase, envPrefix } from './new-lab.mjs';

const roots: string[] = [];

async function fakeRepo(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'lab-new-'));
  roots.push(root);
  await cp(path.join(process.cwd(), 'templates'), path.join(root, 'templates'), { recursive: true });
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true })));
});

describe('helpers', () => {
  it('titleCase', () => expect(titleCase('pixel-garden')).toBe('Pixel Garden'));
  it('envPrefix', () => expect(envPrefix('pixel-garden')).toBe('PIXEL_GARDEN'));
});

describe('scaffold', () => {
  it('creates a basic project with placeholders filled', async () => {
    const root = await fakeRepo();
    const dir = await scaffold({ slug: 'pixel-garden', root, today: '2026-09-26' });

    expect(dir).toBe(path.join(root, 'src/pages/lab/pixel-garden'));
    expect((await readdir(dir)).sort()).toEqual(['_meta.ts', 'index.astro']);

    const meta = await readFile(path.join(dir, '_meta.ts'), 'utf8');
    expect(meta).toContain("title: 'Pixel Garden'");
    expect(meta).toContain("date: '2026-09-26'");
    expect(meta).toContain("status: 'wip'");

    const page = await readFile(path.join(dir, 'index.astro'), 'utf8');
    expect(page).toContain('slug="pixel-garden"');
    expect(page).not.toMatch(/__[A-Z_]+__/);
  });

  it('adds the API layer with --api', async () => {
    const root = await fakeRepo();
    const dir = await scaffold({ slug: 'echo-bot', api: true, root, today: '2026-09-26' });

    const endpoint = await readFile(path.join(dir, 'api/example.ts'), 'utf8');
    expect(endpoint).toContain("slug: 'echo-bot'");
    expect(endpoint).toContain('ECHO_BOT_*');
    expect(endpoint).not.toMatch(/__[A-Z_]+__/);

    const page = await readFile(path.join(dir, 'index.astro'), 'utf8');
    expect(page).toContain("labUrl('echo-bot', 'api/example')");
  });

  it('rejects invalid slugs', async () => {
    const root = await fakeRepo();
    await expect(scaffold({ slug: 'Bad Slug', root })).rejects.toThrow(/kebab-case/);
    await expect(scaffold({ slug: 'www', root })).rejects.toThrow(/reserved/);
  });

  it('refuses to overwrite an existing project', async () => {
    const root = await fakeRepo();
    await scaffold({ slug: 'dupe', root, today: '2026-09-26' });
    await expect(scaffold({ slug: 'dupe', root })).rejects.toThrow(/already exists/);
  });
});
