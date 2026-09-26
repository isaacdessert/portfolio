import type { LabMeta } from './meta';
import { slugError } from './slug-rules.mjs';

export interface LabProject extends LabMeta {
  slug: string;
}

type MetaModule = { default: LabMeta };

function slugFromPath(path: string): string {
  const match = path.match(/\/src\/pages\/lab\/([^/]+)\/[^/]+$/);
  if (!match) throw new Error(`Unexpected lab file path: ${path}`);
  return match[1];
}

export function buildRegistry(
  metaModules: Record<string, MetaModule>,
  indexPaths: string[],
): LabProject[] {
  const projects = Object.entries(metaModules).map(([path, mod]) => {
    const slug = slugFromPath(path);
    const problem = slugError(slug);
    if (problem) throw new Error(`Lab folder "${slug}": ${problem}`);
    if (!mod?.default) {
      throw new Error(`Lab project "${slug}": _meta.ts needs a default export (export default defineLab({...}))`);
    }
    return { ...mod.default, slug };
  });

  const known = new Set(projects.map((p) => p.slug));
  for (const path of indexPaths) {
    const slug = slugFromPath(path);
    if (!known.has(slug)) {
      throw new Error(`Lab project "${slug}" is missing src/pages/lab/${slug}/_meta.ts`);
    }
  }
  return projects;
}

/** Projects shown on the /lab index: no unlisted, newest first, ties by slug. */
export function visibleProjects(projects: LabProject[]): LabProject[] {
  return projects
    .filter((p) => p.status !== 'unlisted')
    .sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

// The one sanctioned way shared code reads project folders: metadata only.
export const projects: LabProject[] = buildRegistry(
  import.meta.glob<MetaModule>('/src/pages/lab/*/_meta.ts', { eager: true }),
  Object.keys(import.meta.glob('/src/pages/lab/*/index.astro')),
);

export function getProject(slug: string): LabProject {
  const project = projects.find((p) => p.slug === slug);
  if (!project) throw new Error(`Unknown lab project "${slug}" (no src/pages/lab/${slug}/_meta.ts)`);
  return project;
}
