# Lab Platform — Design

**Date:** 2026-09-26
**Status:** Approved in brainstorm, pending spec review
**Repo:** `isaacdessert/portfolio` (Astro 5, hosted on Vercel at `isaacdessert.dev`)

## Goal

Make it possible to sit down for a few hours, build a small frontend toy or
light-backend project, and ship it to `isaacdessert.dev/lab/<slug>` (and
`<slug>.isaacdessert.dev`) with nothing more than `npm run new <slug>`,
some code, and `git push`.

### In scope

- Static/frontend toys and light-backend projects (a few API endpoints,
  small KV state, calls to paid APIs like an LLM with hidden keys).
- Path routing at `/lab/<slug>` plus automatic subdomain aliases.
- Strict per-project isolation with one explicit shared space.

### Out of scope (add later, independently)

Realtime/WebSockets (use Fly.io, like land-dispute), auth, analytics,
pre-installed UI frameworks, separate-app subdomains, Postgres/Blob
(documented as one-click add-ons, not provisioned).

### Prerequisite (done)

Hosting moved from GitHub Pages to Vercel: `@astrojs/vercel` v8 adapter with
`output: 'static'` (pages prerender by default; `export const prerender = false`
opts a route into a serverless function), nightly Notion rebuild via Vercel
Deploy Hook, GitHub Pages unpublished.

## 1. Isolation model

Each lab project is a self-contained unit. Projects **never** depend on each
other. Anything intentionally shared lives in a single shared space.

### Import rules

Code under `src/pages/lab/<slug>/` may import only from:

1. Its own folder (relative imports that stay inside `src/pages/lab/<slug>/`).
2. The shared space: `@lab/*` → `src/lab/*`.
3. npm packages.

It may **not** import from another project's folder, from anywhere else under
`src/` (e.g. `@/components/*`, `@/lib/*`, `@/data/*`), or via relative paths
that escape its own folder.

Code in the shared space (`src/lab/`) may import from npm packages, other
files in `src/lab/`, and the portfolio's `BaseLayout` + `global.css` (the one
sanctioned bridge to the portfolio, used only by `LabLayout`). It must never
import from any project folder.

The portfolio itself may import from `src/lab/` only for the `/lab` index
page (reads project metadata via the registry). `src/pages/lab/index.astro`
is portfolio-owned, not a project: the isolation test treats only
subdirectories of `src/pages/lab/` as projects.

### Enforcement

`src/lab/isolation.test.ts` (Vitest, runs in `npm test`) walks every file
under `src/pages/lab/` and `src/lab/`, extracts import specifiers (static
`import … from`, `import '…'`, dynamic `import('…')`, `export … from`) from
`.ts`, `.tsx`, `.js`, `.mjs`, `.astro`, `.svelte`, `.vue` files, resolves
relative paths, and fails with a message naming the offending file and import
if any rule above is broken.

### Runtime isolation

- **KV:** projects never get a raw Redis client. `kv(slug)` returns a client
  whose every key is prefixed `lab:<slug>:`, so projects cannot read or clobber
  each other's data.
- **Rate limits:** keyed by `lab:<slug>:rl:<id>:<ip>`.
- **Secrets:** project-specific env vars are prefixed with the uppercased slug
  (`PIXEL_GARDEN_*`). Shared keys (`ANTHROPIC_API_KEY`, `KV_*`) are the
  intentional exception and are listed in CLAUDE.md.

### Known limit

npm dependencies live in one `package.json` (single Astro app). Isolation is
at the source/import and runtime-data level, not the dependency level. A
project needing a conflicting dependency version is the signal to graduate it
to its own repo + subdomain.

## 2. Layout

```
src/
├── lab/                          # SHARED SPACE (@lab/*)
│   ├── meta.ts                   # defineLab() + schema + types
│   ├── registry.ts               # loads all _meta.ts, sort/filter for index
│   ├── LabLayout.astro           # layout for lab pages
│   ├── url.ts                    # labUrl(), siteUrl()
│   ├── api.ts                    # handler(), json(), readBody(), requireEnv()
│   ├── kv.ts                     # kv(slug) namespaced Upstash client
│   ├── rateLimit.ts              # rateLimit(request, { slug, id, limit, window })
│   └── *.test.ts
├── pages/
│   ├── lab/
│   │   ├── index.astro           # /lab index (portfolio-owned, reads registry)
│   │   ├── hello/                # starter project (see §8)
│   │   └── <slug>/               # one folder per project
│   └── …existing portfolio pages
scripts/
└── new-lab.mjs                   # scaffold
templates/lab/
├── basic/                        # _meta.ts + index.astro
└── api/                          # adds api/example.ts + client fetch on page
```

`tsconfig.json` gains the path alias `"@lab/*": ["src/lab/*"]`.

A project folder:

```
src/pages/lab/pixel-garden/
├── _meta.ts         # required
├── index.astro      # → /lab/pixel-garden
├── about.astro      # optional → /lab/pixel-garden/about
├── _components/     # "_"-prefixed files/dirs are ignored by Astro routing
└── api/             # optional → /lab/pixel-garden/api/*
```

## 3. Project metadata

`_meta.ts`:

```ts
import { defineLab } from '@lab/meta';

export default defineLab({
  title: 'Pixel Garden',
  description: 'Grow a little garden one click at a time.',
  date: '2026-09-25',
  status: 'live',        // 'live' | 'wip' | 'unlisted'
  tags: ['canvas', 'toy'],
});
```

- Schema (zod via `astro/zod`): `title` non-empty string, `description`
  non-empty string, `date` ISO `YYYY-MM-DD`, `status` enum, `tags` string
  array (default `[]`).
- `defineLab` validates at import time and throws a descriptive error.
- Registry (`import.meta.glob('/src/pages/lab/*/_meta.ts', { eager: true })`)
  derives `slug` from the folder name, and fails the build if any project
  folder lacks `_meta.ts` or has an invalid slug (must match
  `^[a-z0-9]+(-[a-z0-9]+)*$`, max 40 chars, not `www`/`api`/`lab`).
- Status semantics:
  - `live` — listed on the index.
  - `wip` — listed with a "wip" badge.
  - `unlisted` — deployed and reachable by URL, hidden from the index,
    `<meta name="robots" content="noindex">`.

## 4. `/lab` index and portfolio integration

- `/lab` lists `live` + `wip` projects, newest first, as cards (title,
  description, date, tags, status badge) in existing tokens
  (`accent-yellow` headings, `accent-green` tags/badges, `bg-surface` cards).
- Empty state: "Nothing in the lab yet."
- Nav gains `{ label: 'Lab', href: '/lab' }`.
- Homepage terminal gains `open lab` → `/lab`.

## 5. LabLayout

`LabLayout.astro` props: `slug`, `title?` (defaults to meta title),
`description?` (defaults to meta description), `fullscreen?: boolean`.

- Wraps `BaseLayout` (nav/footer) with a slim "← lab" link above content.
- `fullscreen` renders a bare viewport (no nav/footer) with a small floating
  "← lab" link.
- All links back to the portfolio use absolute `https://isaacdessert.dev/...`
  URLs (`siteUrl()`), so they work from subdomains.
- Canonical URL always `https://isaacdessert.dev/lab/<slug>/…`.
- `unlisted` status adds `noindex`.

Note: `BaseLayout`'s nav uses root-relative links. On a subdomain those would
rewrite into the project (`/about` → `/lab/<slug>/about`). `BaseLayout`/`Nav`
/`Footer` gain an optional `absoluteLinks` prop that `LabLayout` sets, making
every internal link absolute to the site origin.

## 6. Backend pattern

Endpoint at `src/pages/lab/<slug>/api/<name>.ts` → `/lab/<slug>/api/<name>`:

```ts
import { z } from 'astro/zod';
import { handler, json, readBody } from '@lab/api';
import { rateLimit } from '@lab/rateLimit';

export const prerender = false;

export const POST = handler(async ({ request }) => {
  await rateLimit(request, { slug: 'pixel-garden', id: 'post', limit: 20, window: '1 m' });
  const { prompt } = await readBody(request, z.object({ prompt: z.string().max(500) }));
  return json({ reply: prompt.toUpperCase() });
});
```

### `@lab/api`

- `handler(fn)` wraps an `APIRoute`. Errors map to responses:
  - `HttpError(status, message)` (thrown by helpers) → that status, `{ error }`.
  - zod validation failure → 400, `{ error: 'Invalid request', issues }`.
  - anything else → 500, `{ error: 'Internal error' }`; full error
    `console.error`'d (Vercel function logs). Stack traces never reach clients.
- `json(data, init?)` → `Response` with JSON content type.
- `readBody(request, schema)` → parses JSON (400 on malformed) and validates.
- `requireEnv(name)` → value or throws a 500 `HttpError` with a server-side log
  naming the missing variable.

### `@lab/kv`

`kv(slug)` returns `{ get, set, incr, del, expire }` backed by
`@upstash/redis`, every key prefixed `lab:<slug>:`. Reads `KV_REST_API_URL`
/ `KV_REST_API_TOKEN` (names set by the Vercel Marketplace Upstash
integration; confirm exact names at setup and adjust).

### `@lab/rateLimit`

`rateLimit(request, { slug, id, limit, window })` uses `@upstash/ratelimit`
sliding window keyed by client IP (`x-forwarded-for` first entry, then
`x-real-ip`, else `'unknown'`). Over limit → throws `HttpError(429)` with a
`Retry-After` header. Required for any endpoint calling a paid API; the
`--api` template includes it.

### Secrets

Set in Vercel → Environment Variables (Production + Preview). Local dev:
`vercel link` + `vercel env pull .env`. Server-side only.

## 7. Subdomain routing

- Vercel: add domain `*.isaacdessert.dev` (DNS is on Vercel; wildcard cert is
  automatic). Explicit domains (apex, `www`) take precedence.
- `scripts/vercel-routes.mjs` inserts this route object into
  `.vercel/output/config.json` immediately before `{ "handle": "filesystem" }`,
  after `astro build` (see `package.json`'s `build` script). This has to happen
  post-build, before the filesystem check: `vercel.json` `rewrites` are placed
  *after* `{ handle: "filesystem" }`, so a static route (e.g. the homepage)
  would win before the rewrite ever ran, and the `@astrojs/vercel` adapter
  writes `config.json` itself without merging in `vercel.json` rewrites.
  `vercel.json` itself only pins `buildCommand` so Vercel actually runs that
  build script.

```json
{
  "src": "^/((?!_astro/|_image|_server-islands/|_vercel/|lab/|favicon\\.svg).*)$",
  "has": [{ "type": "host", "value": "(?<slug>(?!www\\.)[a-z0-9-]+)\\.isaacdessert\\.dev" }],
  "dest": "/lab/$slug/$1"
}
```

- Every project gets a subdomain automatically. Unknown subdomains → 404.
- **URL convention:** inside a project, always use absolute `/lab/<slug>/…`
  paths via `labUrl(slug, path)`; never relative (`./api/x`). `/_astro/`,
  `/_image`, `/_server-islands/`, `/_vercel/`, `/lab/`, and `/favicon.svg` are
  excluded from the rewrite so these work on both hosts.
- Subdomains only work in production; previews and `npm run dev` use paths.

## 8. Scaffold and starter project

`npm run new <slug> [-- --api]` (`scripts/new-lab.mjs`):

- Validates slug (same rules as registry) and that the folder doesn't exist.
- Copies `templates/lab/basic` (and `templates/lab/api` if `--api`) into
  `src/pages/lab/<slug>/`, replacing `__SLUG__`, `__TITLE__` (title-cased
  slug), `__DATE__` (today), `__ENV_PREFIX__`.
- New projects start as `status: 'wip'`.
- Prints the local URL and next steps.

Starter project `/lab/hello` (created with the scaffold, then filled in):
a page with a visit counter, `api/visits.ts` (POST increments
`kv('hello').incr('visits')`, rate-limited 10/min). It exercises scaffold →
meta → index → layout → API helper → KV → rate limit → subdomain, and serves as
the reference example.

## 9. Testing

Vitest (`npm test`):

- `isolation.test.ts` — import rules (§1), including fixture cases that must
  fail (cross-project import, `@/components` import, `../..` escape).
- `meta.test.ts` — schema accepts/rejects; slug rules.
- `registry.test.ts` — sort newest first; filter hides `unlisted`.
- `api.test.ts` — `handler` maps HttpError / zod / unknown errors correctly and
  never leaks messages on 500; `readBody` rejects malformed JSON.
- `kv.test.ts` — keys are prefixed (Redis client mocked).
- `rateLimit.test.ts` — IP extraction; 429 + `Retry-After` when limited
  (limiter mocked).
- `url.test.ts` — `labUrl`, `siteUrl`.
- `scripts/vercel-routes.test.ts` — verifies the lab subdomain route is inserted
  immediately before the filesystem handle, and checks host/path emulation
  against a case table (apex, `www`, `hello.` subdomain, `/_astro/…`, `/lab/…`).
- `new-lab.test.ts` — scaffold into a temp dir: files created, placeholders
  replaced, invalid/duplicate slug rejected.

Manual/post-deploy: `npm run build` passes; preview URL renders `/lab` and
`/lab/hello`; after merge, curl `https://hello.isaacdessert.dev/` (200, hello
page), `https://hello.isaacdessert.dev/lab/hello/api/visits` (POST → count),
`https://nope.isaacdessert.dev/` (404).

## 10. User setup steps (during implementation)

1. Vercel → Domains → add `*.isaacdessert.dev`.
2. Vercel Marketplace → Upstash Redis → create + connect to the project
   (Production + Preview).
3. Locally: `npm i -g vercel && vercel link && vercel env pull .env`.

## 11. Documentation

CLAUDE.md gains "Shipping a lab project": workflow, isolation rules and the
shared space, URL conventions, adding a secret, adding Postgres/Blob via
Marketplace, graduating a project to its own repo. Status + TODOs updated.
