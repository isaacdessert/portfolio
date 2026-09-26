# Lab Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Isaac ship small, isolated projects to `isaacjdessert.dev/lab/<slug>` (and `<slug>.isaacjdessert.dev`) with `npm run new <slug>`, some code, and `git push`.

**Architecture:** Each project is one folder under `src/pages/lab/<slug>/` (pages, `_meta.ts`, optional `api/` serverless endpoints). All intentionally shared code lives in `src/lab/` (alias `@lab/*`); an automated test forbids any other cross-imports. Subdomains are a host-based rewrite in `vercel.json`. Upstash Redis (namespaced per project) backs rate limiting and small KV state.

**Tech Stack:** Astro 5 (`output: 'static'` + `@astrojs/vercel` v8), Tailwind v3, zod via `astro/zod`, `@upstash/redis`, `@upstash/ratelimit`, Vitest 4, Node ≥20.

**Spec:** `docs/superpowers/specs/2026-09-26-lab-platform-design.md`

## Global Constraints

- Stay on Astro 5 and `@astrojs/vercel@^8` (v9+ requires newer Astro). Do not upgrade Astro.
- Import zod only from `astro/zod`, never `zod`.
- Do not install UI framework integrations (React/Svelte/etc.).
- **Isolation:** files in `src/pages/lab/<slug>/` import only from their own folder, `@lab/*`, or npm packages. Files in `src/lab/` import only from `src/lab/`, npm packages, `src/layouts/BaseLayout.astro`, `src/styles/global.css`. Portfolio code imports `@lab/*` only in `src/pages/lab/index.astro`.
- Inside `src/lab/`, import sibling files with relative paths (`./api`), not `@lab/…`.
- Never put `*.test.ts` files under `src/pages/` (Astro would route them as endpoints).
- Colors: use existing Tailwind tokens (`bg-bg-primary`, `bg-bg-surface`, `text-accent-yellow`, `text-accent-green`, `text-text-primary`, `text-text-muted`), `font-mono` for UI chrome.
- Slug rules: `^[a-z0-9]+(-[a-z0-9]+)*$`, ≤40 chars, not `www` / `api` / `lab`.
- Site origin: `https://isaacjdessert.dev`.
- Redis env: `KV_REST_API_URL` / `KV_REST_API_TOKEN`, falling back to `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.
- KV keys prefixed `lab:<slug>:`; rate-limit prefix `lab:<slug>:rl:<id>`.
- Every commit also updates the "Status & TODOs" section of `CLAUDE.md` (tick the finished item). Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Work on branch `feat/lab-platform`. Don't push or merge unless a task says so.

---

### Task 1: Test config, `@lab` alias, slug rules, and project metadata

**Files:**
- Create: `vitest.config.ts`
- Modify: `tsconfig.json`
- Create: `src/lab/slug-rules.mjs`
- Create: `src/lab/meta.ts`
- Test: `src/lab/meta.test.ts`
- Modify: `CLAUDE.md` (Status & TODOs)

**Interfaces:**
- Produces:
  - `slugError(slug: unknown): string | null` and `isValidSlug(slug: unknown): boolean` from `src/lab/slug-rules.mjs`
  - `labMetaSchema` (zod), `type LabMeta = { title: string; description: string; date: string; status: 'live' | 'wip' | 'unlisted'; tags: string[] }`, `defineLab(input): LabMeta` from `src/lab/meta.ts`
  - Vitest resolves `@lab/*` → `src/lab/*` and `@/*` → `src/*`

- [ ] **Step 1: Add vitest config and tsconfig alias**

`vitest.config.ts`:
```ts
import { defineConfig, configDefaults } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@lab': fileURLToPath(new URL('./src/lab', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    exclude: [...configDefaults.exclude, '.worktrees/**', '.vercel/**'],
  },
});
```

`tsconfig.json` — replace the `paths` block:
```json
    "paths": {
      "@/*": ["src/*"],
      "@lab/*": ["src/lab/*"]
    }
```

- [ ] **Step 2: Write the failing test** — `src/lab/meta.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { slugError, isValidSlug } from './slug-rules.mjs';
import { defineLab } from './meta';

describe('slug rules', () => {
  it.each(['hello', 'pixel-garden', 'a1', 'x-2-y'])('accepts %s', (slug) => {
    expect(slugError(slug)).toBeNull();
    expect(isValidSlug(slug)).toBe(true);
  });

  it.each([
    ['', 'required'],
    ['Pixel', 'kebab-case'],
    ['pixel_garden', 'kebab-case'],
    ['-lead', 'kebab-case'],
    ['trail-', 'kebab-case'],
    ['dou--ble', 'kebab-case'],
    ['a'.repeat(41), '40'],
    ['www', 'reserved'],
    ['api', 'reserved'],
    ['lab', 'reserved'],
  ])('rejects %j', (slug, fragment) => {
    expect(slugError(slug)).toContain(fragment);
    expect(isValidSlug(slug)).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(slugError(undefined)).toContain('required');
  });
});

describe('defineLab', () => {
  const valid = {
    title: 'Pixel Garden',
    description: 'Grow a garden.',
    date: '2026-09-25',
    status: 'live' as const,
  };

  it('returns parsed metadata with default tags', () => {
    expect(defineLab(valid)).toEqual({ ...valid, tags: [] });
  });

  it('keeps provided tags', () => {
    expect(defineLab({ ...valid, tags: ['toy'] }).tags).toEqual(['toy']);
  });

  it.each([
    [{ title: '' }, 'title'],
    [{ description: '' }, 'description'],
    [{ date: '09/25/2026' }, 'date'],
    [{ date: '2026-13-01' }, 'date'],
    [{ status: 'done' }, 'status'],
  ])('throws a descriptive error for %j', (override, field) => {
    expect(() => defineLab({ ...valid, ...override } as never)).toThrow(
      new RegExp(`Invalid lab _meta\\.ts.*${field}`),
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lab/meta.test.ts`
Expected: FAIL — cannot resolve `./slug-rules.mjs` / `./meta`.

- [ ] **Step 4: Implement** `src/lab/slug-rules.mjs`

```js
// Shared by src/lab/meta.ts (TypeScript) and scripts/new-lab.mjs (plain Node),
// so it is plain JS.

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUG_MAX_LENGTH = 40;
export const RESERVED_SLUGS = ['www', 'api', 'lab'];

/**
 * @param {unknown} slug
 * @returns {string | null} a human-readable problem, or null if valid
 */
export function slugError(slug) {
  if (typeof slug !== 'string' || slug.length === 0) return 'Slug is required';
  if (slug.length > SLUG_MAX_LENGTH) return `Slug must be ${SLUG_MAX_LENGTH} characters or fewer`;
  if (!SLUG_PATTERN.test(slug)) return 'Slug must be lowercase kebab-case (a-z, 0-9, single hyphens)';
  if (RESERVED_SLUGS.includes(slug)) return `Slug "${slug}" is reserved`;
  return null;
}

/**
 * @param {unknown} slug
 * @returns {boolean}
 */
export function isValidSlug(slug) {
  return slugError(slug) === null;
}
```

`src/lab/meta.ts`:
```ts
import { z } from 'astro/zod';

export const labMetaSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1).max(200),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .refine((s) => !Number.isNaN(Date.parse(s)), 'Not a real date'),
  status: z.enum(['live', 'wip', 'unlisted']),
  tags: z.array(z.string()).default([]),
});

export type LabMeta = z.infer<typeof labMetaSchema>;
export type LabMetaInput = z.input<typeof labMetaSchema>;

export function defineLab(input: LabMetaInput): LabMeta {
  const result = labMetaSchema.safeParse(input);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid lab _meta.ts — ${problems}`);
  }
  return result.data;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (new tests + existing `slug.test.ts`).

- [ ] **Step 6: Update CLAUDE.md Status & TODOs**

Replace the line `- [ ] Lab system design (section 2+ of the brainstorm)` with:
```markdown
- [x] Lab system design — spec: `docs/superpowers/specs/2026-09-26-lab-platform-design.md`
- Lab platform build (plan: `docs/superpowers/plans/2026-09-26-lab-platform.md`):
  - [x] Task 1: test config, `@lab` alias, slug rules, metadata
  - [ ] Task 2: URL helpers + project registry
  - [ ] Task 3: API helpers
  - [ ] Task 4: KV + rate limiting
  - [ ] Task 5: isolation checker
  - [ ] Task 6: BaseLayout options + LabLayout
  - [ ] Task 7: /lab index, nav, terminal
  - [ ] Task 8: templates + `npm run new`
  - [ ] Task 9: subdomain rewrite
  - [ ] Task 10: `/lab/hello` starter project
  - [ ] Task 11: docs + preview deploy
  - [ ] Task 12: production smoke test
```
Also tick the four Vercel/GitHub setup TODOs above it (all done in the hosting migration).

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts tsconfig.json src/lab/slug-rules.mjs src/lab/meta.ts src/lab/meta.test.ts CLAUDE.md
git commit -m "feat(lab): slug rules, project metadata schema, @lab alias

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: URL helpers and project registry

**Files:**
- Create: `src/lab/url.ts`
- Create: `src/lab/registry.ts`
- Test: `src/lab/url.test.ts`, `src/lab/registry.test.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `LabMeta` from `./meta`; `slugError` from `./slug-rules.mjs`
- Produces:
  - `SITE_ORIGIN = 'https://isaacjdessert.dev'`, `siteUrl(path: string): string`, `labUrl(slug: string, path?: string): string` from `src/lab/url.ts`
  - `interface LabProject extends LabMeta { slug: string }`, `buildRegistry(metaModules: Record<string, { default: LabMeta }>, indexPaths: string[]): LabProject[]`, `visibleProjects(projects: LabProject[]): LabProject[]`, `projects: LabProject[]`, `getProject(slug: string): LabProject` from `src/lab/registry.ts`

- [ ] **Step 1: Write failing tests**

`src/lab/url.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { SITE_ORIGIN, siteUrl, labUrl } from './url';

describe('siteUrl', () => {
  it('builds absolute URLs on the site origin', () => {
    expect(SITE_ORIGIN).toBe('https://isaacjdessert.dev');
    expect(siteUrl('/about')).toBe('https://isaacjdessert.dev/about');
    expect(siteUrl('/')).toBe('https://isaacjdessert.dev/');
    expect(siteUrl('lab')).toBe('https://isaacjdessert.dev/lab');
  });
});

describe('labUrl', () => {
  it('returns the project root with trailing slash', () => {
    expect(labUrl('hello')).toBe('/lab/hello/');
  });

  it('joins sub-paths without doubling slashes', () => {
    expect(labUrl('hello', 'api/visits')).toBe('/lab/hello/api/visits');
    expect(labUrl('hello', '/api/visits')).toBe('/lab/hello/api/visits');
  });
});
```

`src/lab/registry.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lab/url.test.ts src/lab/registry.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/lab/url.ts`:
```ts
export const SITE_ORIGIN = 'https://isaacjdessert.dev';

/** Absolute URL on the main site. Use for links that must work from a subdomain. */
export function siteUrl(path: string): string {
  return new URL(path, SITE_ORIGIN).href;
}

/**
 * Root-relative URL inside a lab project. Always use this (never "./api/x"):
 * `/lab/...` paths are excluded from the subdomain rewrite, so they work on
 * both isaacjdessert.dev/lab/<slug> and <slug>.isaacjdessert.dev.
 */
export function labUrl(slug: string, path = ''): string {
  return `/lab/${slug}/${path.replace(/^\/+/, '')}`;
}
```

`src/lab/registry.ts`:
```ts
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
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Update CLAUDE.md** — tick Task 2.

- [ ] **Step 6: Commit**

```bash
git add src/lab/url.ts src/lab/url.test.ts src/lab/registry.ts src/lab/registry.test.ts CLAUDE.md
git commit -m "feat(lab): URL helpers and project registry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: API helpers

**Files:**
- Create: `src/lab/api.ts`
- Test: `src/lab/api.test.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Produces (from `src/lab/api.ts`):
  - `class HttpError extends Error { status: number; headers: Record<string, string> }` — `new HttpError(status, message, headers?)`
  - `json(data: unknown, init?: ResponseInit): Response`
  - `handler(fn: (context: APIContext) => Response | Promise<Response>): APIRoute`
  - `readBody<S extends z.ZodTypeAny>(request: Request, schema: S): Promise<z.infer<S>>`
  - `readEnv(name: string): string | undefined`
  - `requireEnv(name: string): string`

- [ ] **Step 1: Write failing test** — `src/lab/api.test.ts`

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { APIContext } from 'astro';
import { z } from 'astro/zod';
import { HttpError, handler, json, readBody, requireEnv, readEnv } from './api';

const ctx = (request = new Request('https://x.test/')) => ({ request }) as APIContext;
const post = (body: string) =>
  new Request('https://x.test/', { method: 'POST', body, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('json', () => {
  it('serializes with JSON content type and passes init through', async () => {
    const res = json({ a: 1 }, { status: 201, headers: { 'x-test': 'y' } });
    expect(res.status).toBe(201);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('x-test')).toBe('y');
    expect(await res.json()).toEqual({ a: 1 });
  });
});

describe('handler', () => {
  it('returns the wrapped response on success', async () => {
    const res = await handler(() => json({ ok: true }))(ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('maps HttpError (4xx) to its status, message, and headers', async () => {
    const res = await handler(() => {
      throw new HttpError(429, 'Too many requests', { 'Retry-After': '30' });
    })(ctx());
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('30');
    expect(await res.json()).toEqual({ error: 'Too many requests' });
  });

  it('hides HttpError (5xx) messages and logs them', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await handler(() => {
      throw new HttpError(500, 'Missing environment variable SECRET');
    })(ctx());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal error' });
    expect(log).toHaveBeenCalled();
  });

  it('maps zod errors to 400 with issues', async () => {
    const res = await handler(() => {
      z.object({ n: z.number() }).parse({ n: 'x' });
      return json({});
    })(ctx());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid request');
    expect(body.issues[0].path).toBe('n');
  });

  it('maps unknown errors to a generic 500 without leaking the message', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await handler(() => {
      throw new Error('db password is hunter2');
    })(ctx());
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('hunter2');
    expect(JSON.parse(text)).toEqual({ error: 'Internal error' });
    expect(log).toHaveBeenCalled();
  });
});

describe('readBody', () => {
  const schema = z.object({ prompt: z.string().max(5) });

  it('parses and validates JSON', async () => {
    expect(await readBody(post('{"prompt":"hi"}'), schema)).toEqual({ prompt: 'hi' });
  });

  it('throws HttpError 400 on malformed JSON', async () => {
    await expect(readBody(post('{nope'), schema)).rejects.toMatchObject({ status: 400 });
  });

  it('throws a ZodError on schema mismatch', async () => {
    await expect(readBody(post('{"prompt":"too long"}'), schema)).rejects.toHaveProperty('issues');
  });
});

describe('env helpers', () => {
  it('readEnv returns undefined for unset vars', () => {
    expect(readEnv('LAB_TEST_UNSET_VAR')).toBeUndefined();
  });

  it('requireEnv returns set values', () => {
    vi.stubEnv('LAB_TEST_VAR', 'value');
    expect(requireEnv('LAB_TEST_VAR')).toBe('value');
  });

  it('requireEnv throws a 500 HttpError naming the variable', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => requireEnv('LAB_TEST_UNSET_VAR')).toThrow(/LAB_TEST_UNSET_VAR/);
    try {
      requireEnv('LAB_TEST_UNSET_VAR');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(500);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lab/api.test.ts`
Expected: FAIL — `./api` not found.

- [ ] **Step 3: Implement** `src/lab/api.ts`

```ts
import type { APIContext, APIRoute } from 'astro';
import { z, ZodError } from 'astro/zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(data), { ...init, headers });
}

/**
 * Wrap an endpoint so every failure becomes a clean JSON response.
 * 4xx HttpErrors show their message; everything else is a generic 500 and
 * the real error goes to the Vercel function logs.
 */
export function handler(
  fn: (context: APIContext) => Response | Promise<Response>,
): APIRoute {
  return async (context) => {
    try {
      return await fn(context);
    } catch (err) {
      if (err instanceof HttpError) {
        if (err.status >= 500) {
          console.error(err);
          return json({ error: 'Internal error' }, { status: err.status, headers: err.headers });
        }
        return json({ error: err.message }, { status: err.status, headers: err.headers });
      }
      if (err instanceof ZodError) {
        return json(
          {
            error: 'Invalid request',
            issues: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
          },
          { status: 400 },
        );
      }
      console.error(err);
      return json({ error: 'Internal error' }, { status: 500 });
    }
  };
}

export async function readBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError(400, 'Malformed JSON body');
  }
  return schema.parse(body);
}

/** Server-side env lookup: runtime process.env first, then Vite/Astro env. */
export function readEnv(name: string): string | undefined {
  const viteEnv = import.meta.env as Record<string, string | undefined>;
  return process.env[name] || viteEnv[name] || undefined;
}

export function requireEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    console.error(`[lab] Missing environment variable ${name}`);
    throw new HttpError(500, `Missing environment variable ${name}`);
  }
  return value;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Update CLAUDE.md** — tick Task 3.

- [ ] **Step 6: Commit**

```bash
git add src/lab/api.ts src/lab/api.test.ts CLAUDE.md
git commit -m "feat(lab): API helpers (handler, json, readBody, env)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Namespaced KV and rate limiting

**Files:**
- Modify: `package.json`, `package-lock.json` (add `@upstash/redis`, `@upstash/ratelimit`)
- Create: `src/lab/kv.ts`, `src/lab/rateLimit.ts`
- Test: `src/lab/kv.test.ts`, `src/lab/rateLimit.test.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `HttpError`, `readEnv` from `./api`
- Produces:
  - From `src/lab/kv.ts`: `getRedis(): Redis`; `interface RedisLike`; `interface LabKv { get<T = unknown>(key: string): Promise<T | null>; set(key: string, value: unknown, opts?: { ex?: number }): Promise<void>; incr(key: string): Promise<number>; del(key: string): Promise<void>; expire(key: string, seconds: number): Promise<void> }`; `createKv(slug: string, getClient: () => RedisLike): LabKv`; `kv(slug: string): LabKv`
  - From `src/lab/rateLimit.ts`: `type Duration`; `interface RateLimitOptions { slug: string; id: string; limit: number; window: Duration }`; `clientIp(request: Request): string`; `rateLimit(request: Request, options: RateLimitOptions): Promise<void>` (throws `HttpError(429)` with `Retry-After`)

- [ ] **Step 1: Install dependencies**

Run: `npm install @upstash/redis@^1.39.0 @upstash/ratelimit@^2.2.0`
Expected: both appear in `package.json` dependencies.

- [ ] **Step 2: Write failing tests**

`src/lab/kv.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { createKv, type RedisLike } from './kv';

function fakeRedis() {
  return {
    get: vi.fn(async () => 7),
    set: vi.fn(async () => 'OK'),
    incr: vi.fn(async () => 8),
    del: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
  };
}

const asClient = (redis: ReturnType<typeof fakeRedis>) => () => redis as unknown as RedisLike;

describe('createKv', () => {
  it('prefixes every key with lab:<slug>:', async () => {
    const redis = fakeRedis();
    const store = createKv('hello', asClient(redis));

    expect(await store.get('visits')).toBe(7);
    await store.set('name', 'x');
    await store.set('temp', 1, { ex: 60 });
    expect(await store.incr('visits')).toBe(8);
    await store.del('name');
    await store.expire('visits', 30);

    expect(redis.get).toHaveBeenCalledWith('lab:hello:visits');
    expect(redis.set).toHaveBeenCalledWith('lab:hello:name', 'x');
    expect(redis.set).toHaveBeenCalledWith('lab:hello:temp', 1, { ex: 60 });
    expect(redis.incr).toHaveBeenCalledWith('lab:hello:visits');
    expect(redis.del).toHaveBeenCalledWith('lab:hello:name');
    expect(redis.expire).toHaveBeenCalledWith('lab:hello:visits', 30);
  });

  it('does not touch the client until first use', () => {
    const getClient = vi.fn(() => fakeRedis() as unknown as RedisLike);
    createKv('hello', getClient);
    expect(getClient).not.toHaveBeenCalled();
  });

  it('keeps projects apart', async () => {
    const redis = fakeRedis();
    await createKv('a', asClient(redis)).incr('n');
    await createKv('b', asClient(redis)).incr('n');
    expect(redis.incr.mock.calls).toEqual([['lab:a:n'], ['lab:b:n']]);
  });
});
```

`src/lab/rateLimit.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { limitMock, ctorSpy } = vi.hoisted(() => ({ limitMock: vi.fn(), ctorSpy: vi.fn() }));

vi.mock('./kv', () => ({ getRedis: () => ({ fake: 'redis' }) }));
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow = vi.fn((limit: number, window: string) => ({ limit, window }));
    limit = limitMock;
    constructor(opts: unknown) {
      ctorSpy(opts);
    }
  },
}));

import { clientIp, rateLimit } from './rateLimit';
import { HttpError } from './api';

const req = (headers: Record<string, string> = {}) => new Request('https://x.test/', { headers });

beforeEach(() => {
  limitMock.mockReset();
});

describe('clientIp', () => {
  it('uses the first x-forwarded-for entry', () => {
    expect(clientIp(req({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('1.1.1.1');
  });
  it('falls back to x-real-ip, then "unknown"', () => {
    expect(clientIp(req({ 'x-real-ip': '3.3.3.3' }))).toBe('3.3.3.3');
    expect(clientIp(req())).toBe('unknown');
  });
});

describe('rateLimit', () => {
  const opts = { slug: 'hello', id: 'visit', limit: 10, window: '1 m' as const };

  it('resolves when under the limit and keys by IP', async () => {
    limitMock.mockResolvedValue({ success: true, reset: Date.now() + 60_000 });
    await expect(rateLimit(req({ 'x-real-ip': '9.9.9.9' }), opts)).resolves.toBeUndefined();
    expect(limitMock).toHaveBeenCalledWith('9.9.9.9');
    expect(ctorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: 'lab:hello:rl:visit', limiter: { limit: 10, window: '1 m' } }),
    );
  });

  it('throws 429 with Retry-After when limited', async () => {
    limitMock.mockResolvedValue({ success: false, reset: Date.now() + 30_000 });
    const err = await rateLimit(req(), opts).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.status).toBe(429);
    expect(Number(err.headers['Retry-After'])).toBeGreaterThanOrEqual(29);
    expect(Number(err.headers['Retry-After'])).toBeLessThanOrEqual(30);
  });

  it('reuses one limiter per slug/id/limit/window', async () => {
    limitMock.mockResolvedValue({ success: true, reset: Date.now() });
    const before = ctorSpy.mock.calls.length;
    await rateLimit(req(), { ...opts, id: 'reuse' });
    await rateLimit(req(), { ...opts, id: 'reuse' });
    expect(ctorSpy.mock.calls.length - before).toBe(1);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/lab/kv.test.ts src/lab/rateLimit.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement**

`src/lab/kv.ts`:
```ts
import { Redis } from '@upstash/redis';
import { HttpError, readEnv } from './api';

let client: Redis | undefined;

/** Raw client. Only shared code (rateLimit) should use this; projects use kv(slug). */
export function getRedis(): Redis {
  if (!client) {
    const url = readEnv('KV_REST_API_URL') ?? readEnv('UPSTASH_REDIS_REST_URL');
    const token = readEnv('KV_REST_API_TOKEN') ?? readEnv('UPSTASH_REDIS_REST_TOKEN');
    if (!url || !token) {
      console.error('[lab] Redis not configured: set KV_REST_API_URL + KV_REST_API_TOKEN (Vercel Marketplace → Upstash)');
      throw new HttpError(500, 'Redis not configured');
    }
    client = new Redis({ url, token });
  }
  return client;
}

export interface RedisLike {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex: number }): Promise<unknown>;
  incr(key: string): Promise<number>;
  del(...keys: string[]): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

export interface LabKv {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<void>;
  incr(key: string): Promise<number>;
  del(key: string): Promise<void>;
  expire(key: string, seconds: number): Promise<void>;
}

/** Key-value store scoped to one project: every key is stored as lab:<slug>:<key>. */
export function createKv(slug: string, getClient: () => RedisLike): LabKv {
  const k = (key: string) => `lab:${slug}:${key}`;
  return {
    get: <T>(key: string) => getClient().get<T>(k(key)),
    async set(key, value, opts) {
      if (opts?.ex) await getClient().set(k(key), value, { ex: opts.ex });
      else await getClient().set(k(key), value);
    },
    incr: (key) => getClient().incr(k(key)),
    async del(key) {
      await getClient().del(k(key));
    },
    async expire(key, seconds) {
      await getClient().expire(k(key), seconds);
    },
  };
}

/** Safe to call at module top level: Redis is only contacted on first use. */
export function kv(slug: string): LabKv {
  return createKv(slug, getRedis as () => RedisLike);
}
```

`src/lab/rateLimit.ts`:
```ts
import { Ratelimit } from '@upstash/ratelimit';
import { getRedis } from './kv';
import { HttpError } from './api';

export type Duration = Parameters<typeof Ratelimit.slidingWindow>[1];

export interface RateLimitOptions {
  slug: string;
  id: string;
  limit: number;
  window: Duration;
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

const limiters = new Map<string, Ratelimit>();

function getLimiter({ slug, id, limit, window }: RateLimitOptions): Ratelimit {
  const key = `${slug}:${id}:${limit}:${window}`;
  let limiter = limiters.get(key);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(limit, window),
      prefix: `lab:${slug}:rl:${id}`,
    });
    limiters.set(key, limiter);
  }
  return limiter;
}

/** Per-IP sliding-window limit. Throws HttpError(429) with Retry-After when exceeded. */
export async function rateLimit(request: Request, options: RateLimitOptions): Promise<void> {
  const { success, reset } = await getLimiter(options).limit(clientIp(request));
  if (!success) {
    const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
    throw new HttpError(429, 'Too many requests', { 'Retry-After': String(retryAfter) });
  }
}
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Update CLAUDE.md** — tick Task 4.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lab/kv.ts src/lab/kv.test.ts src/lab/rateLimit.ts src/lab/rateLimit.test.ts CLAUDE.md
git commit -m "feat(lab): namespaced Upstash KV and per-IP rate limiting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Isolation checker

**Files:**
- Create: `scripts/lab-isolation.mjs`
- Test: `scripts/lab-isolation.test.ts`
- Modify: `CLAUDE.md`

(The spec names `src/lab/isolation.test.ts`. This lives in `scripts/` instead because it is build tooling, not shared runtime code. Behavior is unchanged.)

**Interfaces:**
- Produces: `extractImports(source: string): string[]`; `findViolations(root: string): Promise<Array<{ file: string; import: string; reason: string }>>` (paths are repo-relative with `/` separators)

- [ ] **Step 1: Write failing test** — `scripts/lab-isolation.test.ts`

```ts
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
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run scripts/lab-isolation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `scripts/lab-isolation.mjs`

```js
// Enforces lab isolation (see docs/superpowers/specs/2026-09-26-lab-platform-design.md §1):
// - projects (src/pages/lab/<slug>/) import only their own folder, @lab/*, npm
// - shared space (src/lab/) imports only itself, npm, BaseLayout, global.css
// - portfolio code imports @lab/* only from src/pages/lab/index.astro
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.astro', '.svelte', '.vue']);
const SHARED = 'src/lab/';
const PROJECTS = 'src/pages/lab/';
const LAB_INDEX = 'src/pages/lab/index.astro';
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
  if (spec.startsWith('@lab/')) return SHARED + spec.slice('@lab/'.length);
  if (spec.startsWith('@/')) return 'src/' + spec.slice(2);
  if (spec.startsWith('/')) return spec.slice(1);
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
  if (target !== null && target.startsWith(SHARED) && file !== LAB_INDEX) {
    return 'Only src/pages/lab/index.astro may import from @lab/*';
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
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS, including "passes on the real repo".

- [ ] **Step 5: Update CLAUDE.md** — tick Task 5.

- [ ] **Step 6: Commit**

```bash
git add scripts/lab-isolation.mjs scripts/lab-isolation.test.ts CLAUDE.md
git commit -m "feat(lab): automated isolation check for lab projects

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: BaseLayout options and LabLayout

**Files:**
- Modify: `src/layouts/BaseLayout.astro` (props + head + body)
- Modify: `src/components/Nav.astro` (`absoluteLinks` prop)
- Create: `src/lab/LabLayout.astro`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `getProject` from `./registry`, `siteUrl` from `./url`
- Produces:
  - `BaseLayout` props: `title: string; description?: string; ogImage?: string; absoluteLinks?: boolean; noindex?: boolean; bare?: boolean`
  - `Nav` props: `absoluteLinks?: boolean`
  - `LabLayout` props: `slug: string; title?: string; description?: string; fullscreen?: boolean`

- [ ] **Step 1: Update Nav.astro**

Replace the frontmatter:
```astro
---
interface Props {
  /** Make every link absolute to the site origin (needed on lab subdomains). */
  absoluteLinks?: boolean;
}

const { absoluteLinks = false } = Astro.props;

const navLinks = [
  { label: 'About', href: '/about' },
  { label: 'Projects', href: '/projects' },
  { label: 'Blog', href: '/blog' },
  // { label: 'Reading', href: '/reading' },
];

const currentPath = Astro.url.pathname;
const linkTo = (path: string) => (absoluteLinks ? new URL(path, Astro.site).href : path);
---
```
Then change the logo `href="/"` to `href={linkTo('/')}` and both `href={link.href}` (desktop + mobile lists) to `href={linkTo(link.href)}`. Leave the `currentPath.startsWith(link.href)` checks unchanged.

- [ ] **Step 2: Update BaseLayout.astro**

Props block becomes:
```astro
interface Props {
  title: string;
  description?: string;
  ogImage?: string;
  /** Absolute nav links (for pages served on lab subdomains). */
  absoluteLinks?: boolean;
  /** Emit <meta name="robots" content="noindex">. */
  noindex?: boolean;
  /** No nav/footer/top padding — full-viewport pages. */
  bare?: boolean;
}

const {
  title,
  description = 'Isaac Dessert — Lead Software Engineer. Personal site, blog, and portfolio.',
  ogImage = '/og-default.png',
  absoluteLinks = false,
  noindex = false,
  bare = false,
} = Astro.props;
```
In `<head>`, directly after the canonical link:
```astro
    {noindex && <meta name="robots" content="noindex" />}
```
Replace the `<body>` contents:
```astro
  <body class="min-h-screen flex flex-col">
    {!bare && <Nav absoluteLinks={absoluteLinks} />}
    <main class:list={['flex-1', { 'pt-16': !bare }]}>
      <slot />
    </main>
    {!bare && <Footer />}
  </body>
```
(Footer only has external links, so it needs no change.)

- [ ] **Step 3: Create** `src/lab/LabLayout.astro`

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import { getProject } from './registry';
import { siteUrl } from './url';

interface Props {
  slug: string;
  title?: string;
  description?: string;
  /** Hide nav/footer and give the page the whole viewport (games, canvases). */
  fullscreen?: boolean;
}

const { slug, title, description, fullscreen = false } = Astro.props;
const project = getProject(slug);
const labIndex = siteUrl('/lab');
---

<BaseLayout
  title={title ?? project.title}
  description={description ?? project.description}
  absoluteLinks
  noindex={project.status === 'unlisted'}
  bare={fullscreen}
>
  {fullscreen ? (
    <a
      href={labIndex}
      class="fixed top-3 left-3 z-50 font-mono text-xs px-2 py-1 rounded-sm bg-bg-surface/80 text-text-muted hover:text-accent-yellow transition-colors"
    >
      ← lab
    </a>
  ) : (
    <div class="max-w-5xl mx-auto px-6 pt-8">
      <a href={labIndex} class="font-mono text-sm text-text-muted hover:text-accent-yellow transition-colors">
        ← lab
      </a>
    </div>
  )}
  <slot />
</BaseLayout>
```

- [ ] **Step 4: Verify build and tests**

Run: `npm run build && npm test`
Expected: build completes (no lab projects yet, so LabLayout is not rendered); all tests pass, including the isolation check (LabLayout's imports go through the sanctioned bridge).

- [ ] **Step 5: Update CLAUDE.md** — tick Task 6.

- [ ] **Step 6: Commit**

```bash
git add src/layouts/BaseLayout.astro src/components/Nav.astro src/lab/LabLayout.astro CLAUDE.md
git commit -m "feat(lab): LabLayout with absolute links, noindex, fullscreen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `/lab` index page, nav link, terminal command

**Files:**
- Create: `src/components/LabCard.astro`
- Create: `src/pages/lab/index.astro`
- Modify: `src/components/Nav.astro` (add Lab link)
- Modify: `src/components/Terminal.astro` (`open lab`)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `projects`, `visibleProjects` from `@lab/registry`
- Produces: `LabCard` props `{ href: string; title: string; description: string; date: string; tags: string[]; status: 'live' | 'wip' | 'unlisted' }` (declared inline — `LabCard` must NOT import from `@lab/*`)

- [ ] **Step 1: Create** `src/components/LabCard.astro` (visual language matches `ProjectCard.astro`)

```astro
---
interface Props {
  href: string;
  title: string;
  description: string;
  date: string;
  tags: string[];
  status: 'live' | 'wip' | 'unlisted';
}

const { href, title, description, date, tags, status } = Astro.props;
const shown = new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
---

<a
  href={href}
  class="group block bg-bg-surface border border-bg-surface hover:border-accent-yellow transition-colors duration-200 p-6 rounded-sm"
>
  <div class="flex items-start justify-between gap-4">
    <h2 class="font-mono text-lg font-semibold text-text-primary group-hover:text-accent-yellow transition-colors">
      {title}
    </h2>
    {status === 'wip' && (
      <span class="font-mono text-xs px-2 py-0.5 border border-accent-green text-accent-green rounded-sm shrink-0">
        wip
      </span>
    )}
  </div>
  <p class="mt-2 text-sm text-text-muted">{description}</p>
  <div class="mt-4 flex flex-wrap items-center gap-3 font-mono text-xs">
    <time datetime={date} class="text-text-muted">{shown}</time>
    {tags.map((tag) => <span class="text-accent-green">#{tag}</span>)}
  </div>
</a>
```

- [ ] **Step 2: Create** `src/pages/lab/index.astro`

```astro
---
import BaseLayout from '@/layouts/BaseLayout.astro';
import LabCard from '@/components/LabCard.astro';
import { projects, visibleProjects } from '@lab/registry';

const list = visibleProjects(projects);
---

<BaseLayout title="Lab" description="Small experiments, toys, and tools Isaac has shipped.">
  <section class="max-w-5xl mx-auto px-6 py-16">
    <h1 class="font-mono text-4xl font-bold text-accent-yellow">
      lab<span class="text-accent-green">/</span>
    </h1>
    <p class="mt-4 font-mono text-text-muted">Small experiments, toys, and tools. Some finished, some not.</p>

    {list.length === 0 ? (
      <p class="mt-12 font-mono text-text-muted">Nothing in the lab yet.</p>
    ) : (
      <div class="mt-12 grid gap-6 md:grid-cols-2">
        {list.map((p) => (
          <LabCard
            href={`/lab/${p.slug}/`}
            title={p.title}
            description={p.description}
            date={p.date}
            tags={p.tags}
            status={p.status}
          />
        ))}
      </div>
    )}
  </section>
</BaseLayout>
```

- [ ] **Step 3: Add the nav link** — in `src/components/Nav.astro` `navLinks`, after Blog:
```ts
  { label: 'Lab', href: '/lab' },
```

- [ ] **Step 4: Add `open lab` to the terminal** — in `src/components/Terminal.astro`:
  - help line: `['open [page]',  'Navigate — about · projects · blog · home'],` → `['open [page]',  'Navigate — about · projects · blog · lab · home'],`
  - routes object: add `lab:      '/lab',` after `blog:`
  - usage line: `[about|projects|blog|home]` → `[about|projects|blog|lab|home]`

- [ ] **Step 5: Verify**

Run: `npm run build && npm test`
Expected: build lists `/lab/index.html`; tests pass (isolation allows `@lab/registry` only in `src/pages/lab/index.astro`).
Run: `grep -c "Nothing in the lab yet" .vercel/output/static/lab/index.html`
Expected: `1`

- [ ] **Step 6: Update CLAUDE.md** — tick Task 7.

- [ ] **Step 7: Commit**

```bash
git add src/components/LabCard.astro src/pages/lab/index.astro src/components/Nav.astro src/components/Terminal.astro CLAUDE.md
git commit -m "feat(lab): /lab index page, nav link, terminal command

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Project templates and `npm run new`

**Files:**
- Create: `templates/lab/basic/_meta.ts`, `templates/lab/basic/index.astro`
- Create: `templates/lab/api/index.astro`, `templates/lab/api/api/example.ts`
- Create: `scripts/new-lab.mjs`
- Test: `scripts/new-lab.test.ts`
- Modify: `package.json` (script), `CLAUDE.md`

**Interfaces:**
- Consumes: `slugError` from `src/lab/slug-rules.mjs`; `@lab/meta`, `@lab/LabLayout.astro`, `@lab/url`, `@lab/api`, `@lab/rateLimit` (inside templates)
- Produces: `titleCase(slug: string): string`, `envPrefix(slug: string): string`, `scaffold({ slug, api?, root?, today? }): Promise<string>` (returns created dir); CLI `npm run new <slug> [-- --api]`

- [ ] **Step 1: Create templates**

`templates/lab/basic/_meta.ts`:
```ts
import { defineLab } from '@lab/meta';

export default defineLab({
  title: '__TITLE__',
  description: 'A new lab project.',
  date: '__DATE__',
  status: 'wip',
  tags: [],
});
```

`templates/lab/basic/index.astro`:
```astro
---
import LabLayout from '@lab/LabLayout.astro';
---

<LabLayout slug="__SLUG__">
  <section class="max-w-3xl mx-auto px-6 py-12">
    <h1 class="font-mono text-3xl font-bold text-accent-yellow">__TITLE__</h1>
    <p class="mt-4 text-text-primary">
      Start building in <code class="text-accent-green">src/pages/lab/__SLUG__/</code>.
    </p>
  </section>
</LabLayout>
```

`templates/lab/api/index.astro` (overwrites the basic one when `--api` is used):
```astro
---
import LabLayout from '@lab/LabLayout.astro';
import { labUrl } from '@lab/url';
---

<LabLayout slug="__SLUG__">
  <section class="max-w-3xl mx-auto px-6 py-12">
    <h1 class="font-mono text-3xl font-bold text-accent-yellow">__TITLE__</h1>
    <form id="echo-form" data-endpoint={labUrl('__SLUG__', 'api/example')} class="mt-6 flex gap-2">
      <input
        name="message"
        required
        maxlength="500"
        placeholder="say something"
        class="flex-1 bg-bg-surface text-text-primary font-mono px-3 py-2 rounded-sm"
      />
      <button class="font-mono px-4 py-2 bg-accent-yellow text-bg-primary rounded-sm">send</button>
    </form>
    <pre id="echo-output" class="mt-4 font-mono text-sm text-accent-green whitespace-pre-wrap"></pre>
  </section>
</LabLayout>

<script>
  const form = document.getElementById('echo-form') as HTMLFormElement;
  const output = document.getElementById('echo-output') as HTMLPreElement;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const res = await fetch(form.dataset.endpoint!, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: new FormData(form).get('message') }),
    });
    output.textContent = JSON.stringify(await res.json(), null, 2);
  });
</script>
```

`templates/lab/api/api/example.ts`:
```ts
import { z } from 'astro/zod';
import { handler, json, readBody } from '@lab/api';
import { rateLimit } from '@lab/rateLimit';

// Project-specific secrets: name them __ENV_PREFIX___* in Vercel and read them with requireEnv().
export const prerender = false;

export const POST = handler(async ({ request }) => {
  await rateLimit(request, { slug: '__SLUG__', id: 'example', limit: 20, window: '1 m' });
  const { message } = await readBody(request, z.object({ message: z.string().min(1).max(500) }));
  return json({ echo: message });
});
```

- [ ] **Step 2: Write failing test** — `scripts/new-lab.test.ts`

```ts
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
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run scripts/new-lab.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement** `scripts/new-lab.mjs`

```js
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
```

- [ ] **Step 5: Add npm script** — in `package.json` `scripts`:
```json
    "new": "node scripts/new-lab.mjs",
```

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Smoke test the CLI, then clean up**

Run: `npm run new tmp-check -- --api && npm run build && ls .vercel/output/static/lab/tmp-check/index.html && rm -rf src/pages/lab/tmp-check`
Expected: prints "Created src/pages/lab/tmp-check/ (with API route)"; build succeeds and emits the page plus a function for `lab/tmp-check/api/example`; directory removed afterwards. Confirm `git status` shows no `src/pages/lab/tmp-check`.

- [ ] **Step 8: Update CLAUDE.md** — tick Task 8.

- [ ] **Step 9: Commit**

```bash
git add templates scripts/new-lab.mjs scripts/new-lab.test.ts package.json CLAUDE.md
git commit -m "feat(lab): project templates and npm run new scaffold

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Subdomain rewrite

**Files:**
- Create: `vercel.json`
- Test: `scripts/vercel-rewrites.test.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Produces: `vercel.json` with one host-based rewrite (`<slug>.isaacjdessert.dev/<path>` → `/lab/<slug>/<path>`, excluding `/_astro/`, `/lab/`, `/favicon.svg`, and `www`)

- [ ] **Step 1: Write failing test** — `scripts/vercel-rewrites.test.ts`

This emulates Vercel's matching with JS regex: the host `value` is a regex, and the source's `:path(...)` group is a regex. It checks our patterns' intent. Task 12 verifies real Vercel behavior.

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
const rule = config.rewrites[0];
const hostRe = new RegExp(`^${rule.has[0].value}$`);
const inner = (rule.source as string).match(/^\/:path\((.*)\)$/)![1];
const pathRe = new RegExp(`^/${inner}$`);

function rewrite(host: string, pathname: string): string | null {
  const h = host.match(hostRe);
  if (!h || !pathRe.test(pathname)) return null;
  return rule.destination.replace(':slug', h.groups!.slug).replace(':path', pathname.slice(1));
}

describe('vercel.json subdomain rewrite', () => {
  it('has exactly one rewrite with a host condition', () => {
    expect(config.rewrites).toHaveLength(1);
    expect(rule.has[0].type).toBe('host');
    expect(rule.destination).toBe('/lab/:slug/:path');
  });

  it.each([
    ['hello.isaacjdessert.dev', '/', '/lab/hello/'],
    ['hello.isaacjdessert.dev', '/about', '/lab/hello/about'],
    ['pixel-garden.isaacjdessert.dev', '/a/b', '/lab/pixel-garden/a/b'],
  ])('%s%s → %s', (host, p, expected) => {
    expect(rewrite(host, p)).toBe(expected);
  });

  it.each([
    ['isaacjdessert.dev', '/'],
    ['www.isaacjdessert.dev', '/'],
    ['a.b.isaacjdessert.dev', '/'],
    ['hello.isaacjdessert.dev', '/_astro/index.abc123.js'],
    ['hello.isaacjdessert.dev', '/lab/hello/api/visits'],
    ['hello.isaacjdessert.dev', '/favicon.svg'],
    ['hello.example.com', '/'],
  ])('does not rewrite %s%s', (host, p) => {
    expect(rewrite(host, p)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run scripts/vercel-rewrites.test.ts`
Expected: FAIL — `vercel.json` not found.

- [ ] **Step 3: Create** `vercel.json`

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/:path((?!_astro/|lab/|favicon\\.svg).*)",
      "has": [
        {
          "type": "host",
          "value": "(?<slug>(?!www\\.)[a-z0-9-]+)\\.isaacjdessert\\.dev"
        }
      ],
      "destination": "/lab/:slug/:path"
    }
  ]
}
```

- [ ] **Step 4: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS; build succeeds.

- [ ] **Step 5: Update CLAUDE.md** — tick Task 9.

- [ ] **Step 6: Commit**

```bash
git add vercel.json scripts/vercel-rewrites.test.ts CLAUDE.md
git commit -m "feat(lab): subdomain rewrite <slug>.isaacjdessert.dev → /lab/<slug>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: `/lab/hello` starter project

**Files:**
- Create (via scaffold, then edit): `src/pages/lab/hello/_meta.ts`, `src/pages/lab/hello/index.astro`, `src/pages/lab/hello/api/visits.ts`
- Delete: `src/pages/lab/hello/api/example.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `defineLab`, `LabLayout`, `labUrl`, `handler`, `json`, `kv`, `rateLimit`
- Produces: `GET /lab/hello/api/visits` → `{ visits: number }`; `POST /lab/hello/api/visits` → `{ visits: number }` (increments, 10/min per IP)

- [ ] **Step 1: User checkpoint — pause and ask Isaac to finish setup** (the controller relays this; do not continue until confirmed):
  1. Vercel → portfolio project → Settings → Domains → add `*.isaacjdessert.dev`.
  2. Vercel → Storage / Marketplace → Upstash for Redis → create a database and connect it to the portfolio project for Production and Preview.
  3. Locally: `npm i -g vercel && vercel link && vercel env pull .env`.
  Then check which Redis variable names landed: `grep -oE '^(KV|UPSTASH)[A-Z_]*' .env`. Expected: `KV_REST_API_URL` and `KV_REST_API_TOKEN`, or the `UPSTASH_REDIS_REST_*` pair. If neither pair is there, stop and report.

- [ ] **Step 2: Scaffold**

Run: `npm run new hello -- --api && rm src/pages/lab/hello/api/example.ts`

- [ ] **Step 3: Write** `src/pages/lab/hello/_meta.ts`

```ts
import { defineLab } from '@lab/meta';

export default defineLab({
  title: 'Hello, Lab',
  description: 'The reference lab project: a page, an API route, and a shared visit counter.',
  date: '2026-09-26',
  status: 'live',
  tags: ['example', 'api'],
});
```

- [ ] **Step 4: Write** `src/pages/lab/hello/api/visits.ts`

```ts
import { handler, json } from '@lab/api';
import { kv } from '@lab/kv';
import { rateLimit } from '@lab/rateLimit';

export const prerender = false;

const store = kv('hello');

export const GET = handler(async () => {
  return json({ visits: (await store.get<number>('visits')) ?? 0 });
});

export const POST = handler(async ({ request }) => {
  await rateLimit(request, { slug: 'hello', id: 'visit', limit: 10, window: '1 m' });
  return json({ visits: await store.incr('visits') });
});
```

- [ ] **Step 5: Write** `src/pages/lab/hello/index.astro`

```astro
---
import LabLayout from '@lab/LabLayout.astro';
import { labUrl } from '@lab/url';
---

<LabLayout slug="hello">
  <section class="max-w-3xl mx-auto px-6 py-12">
    <h1 class="font-mono text-3xl font-bold text-accent-yellow">Hello, Lab<span class="text-accent-green">.</span></h1>
    <p class="mt-4 text-text-primary">
      This page is static. The counter below comes from a serverless function backed by Redis —
      the smallest end-to-end example of a lab project.
    </p>
    <p class="mt-8 font-mono text-text-muted">
      visits:
      <span id="visits" data-endpoint={labUrl('hello', 'api/visits')} class="text-accent-green text-2xl">…</span>
    </p>
    <p id="visits-note" class="mt-2 font-mono text-xs text-text-muted"></p>
  </section>
</LabLayout>

<script>
  const el = document.getElementById('visits') as HTMLSpanElement;
  const note = document.getElementById('visits-note') as HTMLParagraphElement;
  const endpoint = el.dataset.endpoint!;

  async function load() {
    let res = await fetch(endpoint, { method: 'POST' });
    if (res.status === 429) {
      note.textContent = 'Slow down — showing the current count without adding to it.';
      res = await fetch(endpoint);
    }
    if (!res.ok) {
      el.textContent = '?';
      note.textContent = 'Counter unavailable right now.';
      return;
    }
    const { visits } = await res.json();
    el.textContent = String(visits);
  }

  load();
</script>
```

- [ ] **Step 6: Verify build, tests, and local behavior**

Run: `npm test && npm run build`
Expected: all pass; the build output includes `lab/hello/index.html` and a function for `lab/hello/api/visits`.

Run: `grep -c "Hello, Lab" .vercel/output/static/lab/index.html`
Expected: `1` (the project shows on the index).

Run the dev server in the background (`npm run dev`), then:
```bash
curl -s -X POST http://localhost:4321/lab/hello/api/visits
curl -s http://localhost:4321/lab/hello/api/visits
for i in $(seq 1 11); do curl -s -o /dev/null -w "%{http_code} " -X POST http://localhost:4321/lab/hello/api/visits; done; echo
```
Expected: first → `{"visits":N}`; second → the same N; loop ends with at least one `429`. Stop the dev server.

- [ ] **Step 7: Update CLAUDE.md** — tick Task 10.

- [ ] **Step 8: Commit**

```bash
git add src/pages/lab/hello CLAUDE.md
git commit -m "feat(lab): /lab/hello starter project with Redis visit counter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Documentation and preview deploy

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a "Shipping a Lab Project" section to CLAUDE.md** (after "Rendering Model"). Also add `lab/`, `LabCard.astro`, `scripts/`, `templates/` to the Project Structure tree.

````markdown
## Shipping a Lab Project

Small projects live at `isaacjdessert.dev/lab/<slug>` and `<slug>.isaacjdessert.dev`.
Spec: `docs/superpowers/specs/2026-09-26-lab-platform-design.md`.

### Workflow

```bash
git checkout -b lab/<slug>
npm run new <slug>              # page + _meta.ts
npm run new <slug> -- --api     # …plus a rate-limited API route
npm run dev                     # http://localhost:4321/lab/<slug>/
git push -u origin lab/<slug>   # Vercel preview URL
# merge to main → live
```

`_meta.ts` `status`: `wip` (listed with badge), `live`, `unlisted` (reachable, hidden, noindex).
`src/pages/lab/hello/` is the reference example.

### Isolation rules (enforced by `npm test`)

- A project (`src/pages/lab/<slug>/`) imports only from its own folder, `@lab/*`, or npm packages.
- Shared code lives in `src/lab/` (`@lab/*`): `meta`, `registry`, `url`, `api`, `kv`, `rateLimit`, `LabLayout.astro`.
  Add to it only when something is intentionally shared.
- Only `src/pages/lab/index.astro` may import `@lab/*` from portfolio code.
- npm dependencies are shared (one `package.json`). Needing a conflicting version = time to graduate.

### Conventions

- Wrap pages in `LabLayout` (`fullscreen` for games/canvases).
- Link inside a project with `labUrl(slug, path)` → `/lab/<slug>/...`. Never relative `./api/x`
  (it breaks on subdomains).
- `_`-prefixed files/dirs are ignored by the router (`_components/`, `_lib/`).
- Endpoints: `api/<name>.ts` with `export const prerender = false`, wrapped in `handler()`.
  Validate input with `readBody(request, zodSchema)` (`import { z } from 'astro/zod'`).
- Any endpoint that calls a paid API **must** call `rateLimit()` first.
- State: `kv('<slug>')` — keys are auto-prefixed `lab:<slug>:`.

### Secrets

- Add in Vercel → Settings → Environment Variables (Production + Preview), then `vercel env pull .env`.
- Project-specific: prefix with the slug in UPPER_SNAKE (`PIXEL_GARDEN_API_KEY`); read with `requireEnv()`.
- Shared (intentional): `KV_REST_API_URL`, `KV_REST_API_TOKEN` (Upstash), `ANTHROPIC_API_KEY` when added.
- Set a monthly spend cap in each paid API's console.

### Adding storage

- Postgres: Vercel Marketplace → Neon → connect to project → `vercel env pull .env`.
- File uploads: Vercel → Storage → Blob → connect → `vercel env pull .env`.
- Wrap either in a shared `src/lab/` helper only once a second project needs it.

### Subdomains

`vercel.json` rewrites `<slug>.isaacjdessert.dev/*` → `/lab/<slug>/*` (production only; `/_astro/`,
`/lab/`, `/favicon.svg` pass through). The wildcard domain is configured in Vercel → Domains.

### Graduating a project

When a project needs its own dependencies, runtime (WebSockets → Fly.io), or it just gets big: move it
to its own repo and Vercel project, add `<slug>.isaacjdessert.dev` as an explicit domain there (explicit
beats wildcard), and delete the lab folder.
````

- [ ] **Step 2: Update Status & TODOs** — set **Status** to "Lab platform built on `feat/lab-platform`; awaiting production smoke test." and tick Task 11.

- [ ] **Step 3: Final verification**

Run: `npm test && npm run build`
Expected: all pass.

- [ ] **Step 4: Commit and push the branch for a preview**

```bash
git add CLAUDE.md
git commit -m "docs: lab platform workflow, conventions, and secrets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin feat/lab-platform
```
Wait for the Vercel commit status to succeed: `gh api repos/isaacdessert/portfolio/commits/$(git rev-parse HEAD)/status --jq '.statuses[] | select(.context|test("Vercel";"i")) | .state'` → `success`. Get the preview URL from the deployment's `environment_url`. Previews sit behind Vercel's login, so ask Isaac to check `/lab`, `/lab/hello` (the counter increments), and that the nav links work.

---

### Task 12: Merge and production smoke test (after Isaac approves the preview)

- [ ] **Step 1: Merge only on Isaac's explicit go-ahead**

```bash
git checkout main && git pull --ff-only && git merge --ff-only feat/lab-platform && git push origin main
```

- [ ] **Step 2: Wait for the production deploy** (the Vercel status on the `main` HEAD is `success`).

- [ ] **Step 3: Smoke test**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://isaacjdessert.dev/lab/                      # 200
curl -s https://isaacjdessert.dev/lab/hello/ | grep -c "Hello, Lab"                          # ≥1
curl -s -X POST https://isaacjdessert.dev/lab/hello/api/visits                               # {"visits":N}
curl -s https://hello.isaacjdessert.dev/ | grep -c "Hello, Lab"                              # ≥1 (rewrite works)
curl -s -o /dev/null -w "%{http_code}\n" https://hello.isaacjdessert.dev/_astro/ 2>/dev/null # not rewritten (404 is fine)
curl -s -X POST https://hello.isaacjdessert.dev/lab/hello/api/visits                         # {"visits":N+1}
curl -s -o /dev/null -w "%{http_code}\n" https://nope.isaacjdessert.dev/                     # 404
curl -s -o /dev/null -w "%{http_code}\n" https://www.isaacjdessert.dev/                      # 200 or 30x (not a lab 404)
```
If the network is sandboxed, ask Isaac to run these with `! <command>`.

**If the subdomain rewrite doesn't apply** (hello.isaacjdessert.dev shows the homepage or a 404): Vercel may not honor `vercel.json` rewrites alongside the adapter's Build Output. Fallback: set `edgeMiddleware: true` in the adapter config and add an Astro middleware at `src/middleware.ts` that reads the `host` header and rewrites with `context.rewrite('/lab/<slug>/<path>')`, using the same exclusions. Report back to the controller before implementing it — it needs its own review.

- [ ] **Step 4: Update CLAUDE.md** — Status: "Lab platform live." Tick Task 12. Commit on a branch, merge with Isaac's OK.
