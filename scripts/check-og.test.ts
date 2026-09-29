import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findMissingOgImages } from './check-og.mjs';

const roots: string[] = [];

async function outDir(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'check-og-'));
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

function pageHtml(ogImage: string): string {
  return `<!doctype html><html><head><meta property="og:image" content="${ogImage}"></head><body></body></html>`;
}

describe('findMissingOgImages', () => {
  it('returns [] when every og:image resolves to a file in the output dir', async () => {
    const dir = await outDir({
      'index.html': pageHtml('https://isaacdessert.dev/og-default.png'),
      'about/index.html': pageHtml('https://isaacdessert.dev/og/about.png'),
      'og-default.png': 'fake-png',
      'og/about.png': 'fake-png',
    });
    expect(await findMissingOgImages(dir)).toEqual([]);
  });

  it('flags a page whose og:image has no matching file', async () => {
    const dir = await outDir({
      'lab/injuries/index.html': pageHtml('https://isaacdessert.dev/og/lab/injuries.png'),
    });
    const missing = await findMissingOgImages(dir);
    expect(missing).toEqual([{ file: 'lab/injuries/index.html', image: '/og/lab/injuries.png' }]);
  });

  it('handles multiple pages, flagging only the ones missing a file', async () => {
    const dir = await outDir({
      'a/index.html': pageHtml('https://isaacdessert.dev/og/a.png'),
      'b/index.html': pageHtml('https://isaacdessert.dev/og/b.png'),
      'og/a.png': 'fake-png',
    });
    const missing = await findMissingOgImages(dir);
    expect(missing).toEqual([{ file: 'b/index.html', image: '/og/b.png' }]);
  });

  it('ignores pages with no og:image meta tag', async () => {
    const dir = await outDir({
      'index.html': '<!doctype html><html><head></head><body></body></html>',
    });
    expect(await findMissingOgImages(dir)).toEqual([]);
  });

  it('returns [] for an empty output dir', async () => {
    const dir = await outDir({});
    expect(await findMissingOgImages(dir)).toEqual([]);
  });
});
