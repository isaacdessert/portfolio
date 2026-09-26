import { describe, it, expect } from 'vitest';
import { buildRegistry, visibleProjects, type LabProject } from './registry';
import type { LabMeta } from './meta';

const meta = (overrides: Partial<LabMeta> = {}): LabMeta => ({
  title: 'T',
  description: 'D',
  date: '2026-01-01',
  status: 'live',
  tags: [],
  ...overrides,
});

describe('buildRegistry', () => {
  it('derives slug from the folder name', () => {
    const projects = buildRegistry(
      { '/src/pages/lab/pixel-garden/_meta.ts': { default: meta({ title: 'PG' }) } },
      ['/src/pages/lab/pixel-garden/index.astro'],
    );
    expect(projects).toEqual([{ ...meta({ title: 'PG' }), slug: 'pixel-garden' }]);
  });

  it('throws when a project folder has index.astro but no _meta.ts', () => {
    expect(() => buildRegistry({}, ['/src/pages/lab/orphan/index.astro'])).toThrow(
      /orphan.*missing.*_meta\.ts/,
    );
  });

  it('throws on an invalid folder slug', () => {
    expect(() =>
      buildRegistry({ '/src/pages/lab/Bad_Slug/_meta.ts': { default: meta() } }, []),
    ).toThrow(/Bad_Slug.*kebab-case/);
  });

  it('throws when _meta.ts has no default export', () => {
    expect(() =>
      buildRegistry({ '/src/pages/lab/empty/_meta.ts': {} as { default: LabMeta } }, []),
    ).toThrow(/empty.*default export/);
  });
});

describe('visibleProjects', () => {
  const p = (slug: string, date: string, status: LabMeta['status'] = 'live'): LabProject => ({
    ...meta({ date, status }),
    slug,
  });

  it('hides unlisted and sorts newest first, then by slug', () => {
    const result = visibleProjects([
      p('old', '2026-01-01'),
      p('secret', '2026-12-01', 'unlisted'),
      p('b-new', '2026-06-01', 'wip'),
      p('a-new', '2026-06-01'),
    ]);
    expect(result.map((x) => x.slug)).toEqual(['a-new', 'b-new', 'old']);
  });

  it('does not mutate its input', () => {
    const input = [p('a', '2026-01-01'), p('b', '2026-02-01')];
    visibleProjects(input);
    expect(input.map((x) => x.slug)).toEqual(['a', 'b']);
  });
});
