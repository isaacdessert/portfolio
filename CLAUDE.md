# Portfolio Site — Claude Context

Personal portfolio site for Isaac Dessert (Lead Software Engineer).
Built with Astro + Tailwind CSS, hosted on Vercel at https://isaacdessert.dev.

## Local Development

```bash
npm install
npm run dev       # http://localhost:4321/
npm test          # vitest (unit tests + lab isolation check)
npm run build     # isolation check → astro build → scripts/vercel-routes.mjs; output in .vercel/output/
```

Local secrets: `vercel env pull .env --environment=preview` (the Development environment has no
variables). If values come back as `[SENSITIVE]`, see "Secrets" below — Redis/Notion won't work
locally until real values are in `.env`.

### Ship a lab project (quick start)

```bash
git checkout -b lab/<slug>
npm run new <slug>              # add `-- --api` for a rate-limited endpoint
npm run dev                     # http://localhost:4321/lab/<slug>/
git push -u origin lab/<slug>   # preview URL
# merge to main → live at isaacdessert.dev/lab/<slug> and <slug>.isaacdessert.dev
```

Full details: "Shipping a Lab Project" below. Reference example: `src/pages/lab/hello/`.

### Gotchas (learned the hard way)

- The domain is **isaacdessert.dev** (no "j"). The email `isaacjdessert@gmail.com` does have one.
  The origin lives in two places: `site` in `astro.config.mjs` and `SITE_ORIGIN` in `src/lab/url.ts`.
- `vercel.json` `rewrites` do **not** work for subdomains here: the Astro adapter writes its own
  `.vercel/output/config.json`, and rewrites run after static files anyway. The subdomain route is
  inserted by `scripts/vercel-routes.mjs`; `vercel.json` only pins `buildCommand`.
- Call lab endpoints with JSON (`content-type: application/json`). Astro's origin check returns 403
  for bodiless/form POSTs on Vercel ("Cross-site POST form submissions are forbidden").
- Subdomain misses fall back to the main site (no 404) — see "Subdomains".
- Preview deployments are behind Vercel login; `vercel curl <path> --deployment <url>` works from the CLI.

## Deployment

Vercel Git integration: push to `main` → production deploy to isaacdessert.dev.
Any other branch / PR → preview deploy with its own URL.

Nightly rebuild at midnight US Central fetches new Notion posts:
`.github/workflows/nightly-rebuild.yml` POSTs to a Vercel Deploy Hook
(stored as the `VERCEL_DEPLOY_HOOK` repo secret).
Manual rebuild: GitHub → Actions → "Nightly Rebuild" → Run workflow
(or "Redeploy" in the Vercel dashboard).

Env vars (`NOTION_TOKEN`, `NOTION_DATABASE_ID`, and any future project
secrets) live in Vercel → Project → Settings → Environment Variables,
set for both Production and Preview.

## Rendering Model

`output: 'static'` + `@astrojs/vercel` adapter (v8 — v9+ requires newer Astro).
Everything is prerendered to static HTML by default. A page or endpoint that
declares `export const prerender = false` is deployed as a Vercel serverless
function instead. `vercel.json` only pins `buildCommand`; routing comes from the
adapter's own `.vercel/output/config.json` plus `scripts/vercel-routes.mjs` (see
Subdomains below).

## Shipping a Lab Project

Small projects live at `isaacdessert.dev/lab/<slug>` and `<slug>.isaacdessert.dev`.
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

### Isolation rules (enforced by `npm test` and by `npm run build`, so violations fail the deploy)

- A project (`src/pages/lab/<slug>/`) imports only from its own folder, `@lab/*`, or npm packages.
- Shared code lives in `src/lab/` (`@lab/*`): `meta`, `registry`, `url`, `api`, `kv`, `rateLimit`, `LabLayout.astro`.
  Add to it only when something is intentionally shared.
- Only `src/pages/lab/index.astro` may import `@lab/*` from portfolio code.
- npm dependencies are shared (one `package.json`). Needing a conflicting version = time to graduate.

### Conventions

- Wrap pages in `LabLayout` (`fullscreen` for games/canvases).
- Link inside a project with `labUrl(slug, path)` → `/lab/<slug>/...`. Never relative `./api/x`
  (it breaks on subdomains).
- Links built with `siteUrl()` and the nav on lab pages point at production, even on preview deployments.
- `_`-prefixed files/dirs are ignored by the router (`_components/`, `_lib/`).
- Endpoints: `api/<name>.ts` with `export const prerender = false`, wrapped in `handler()`.
  Validate input with `readBody(request, zodSchema)` (`import { z } from 'astro/zod'`).
- Call endpoints with JSON (`content-type: application/json`). Bodiless or form POSTs get a 403 from Astro's origin check on Vercel.
- Any endpoint that calls a paid API **must** call `rateLimit()` first.
- `rateLimit()` keys on `x-forwarded-for`, which Vercel's edge sets; don't trust it if the site ever moves off Vercel.
- State: `kv('<slug>')` — keys are auto-prefixed `lab:<slug>:`.

### Secrets

- Add in Vercel → Settings → Environment Variables (Production + Preview), then `vercel env pull .env --environment=preview`.
- If pulled values show as `[SENSITIVE]`, Vercel withheld them (sensitive vars, or the CLI redacting inside an AI session). Re-run the pull in a normal terminal, or paste the Upstash REST URL/token from the Upstash console into `.env`. Deployed environments are unaffected.
- Project-specific: prefix with the slug in UPPER_SNAKE (`PIXEL_GARDEN_API_KEY`); read with `requireEnv()`.
- Shared (intentional): `KV_REST_API_URL`, `KV_REST_API_TOKEN` (Upstash), `ANTHROPIC_API_KEY` when added.
- Set a monthly spend cap in each paid API's console.
- Set a monthly budget/cap in Upstash too; rate limiting spends Redis commands even when it rejects.

### Adding storage

- Postgres: Vercel Marketplace → Neon → connect to project → `vercel env pull .env --environment=preview`.
- File uploads: Vercel → Storage → Blob → connect → `vercel env pull .env --environment=preview`.
- Wrap either in a shared `src/lab/` helper only once a second project needs it.

### Subdomains

`scripts/vercel-routes.mjs` inserts the `<slug>.isaacdessert.dev/*` → `/lab/<slug>/*` route into
`.vercel/output/config.json` immediately before the `{ handle: "filesystem" }` entry (run by
`npm run build`; `vercel.json` pins `buildCommand` so Vercel actually runs that build script).
Plain `vercel.json` `rewrites` can't do this because they're placed after the filesystem check, so a
static route like the homepage would win before the rewrite ever ran. Passthrough prefixes (excluded
from the rewrite so they work identically on both hosts): `/_astro/`, `/_image`, `/_server-islands/`,
`/_vercel/`, `/lab/`, `/favicon.svg`. Production only; the wildcard domain is configured in
Vercel → Domains.

If the rewritten path doesn't exist, Vercel falls back to the original path: `nope.isaacdessert.dev/`
shows the homepage and `hello.isaacdessert.dev/about` shows the About page (not a 404). Harmless —
canonical URLs always point at the apex — but don't rely on subdomain 404s.

### Graduating a project

When a project needs its own dependencies, runtime (WebSockets → Fly.io), or it just gets big: move it
to its own repo and Vercel project, add `<slug>.isaacdessert.dev` as an explicit domain there (explicit
beats wildcard), and delete the lab folder.

## Tech Stack

- **Framework**: Astro 5 (static by default, opt-in serverless via `@astrojs/vercel`)
- **Styling**: Tailwind CSS v3 + `@tailwindcss/typography`
- **Blog**: Notion CMS via Astro 5 Content Layer
- **Projects**: GitHub REST API fetched at build time (no token — public API only)
- **Hosting**: Vercel (domain + DNS also on Vercel)

## Color System

| Token           | Hex       | Usage                        |
|-----------------|-----------|------------------------------|
| `bg-primary`    | `#0d0d0d` | Page background              |
| `bg-surface`    | `#1a1a1a` | Cards, nav, terminal         |
| `accent-yellow` | `#f5e642` | Headings, CTAs, highlights   |
| `accent-green`  | `#39ff14` | Tags, badges, active states  |
| `text-primary`  | `#e8e8e8` | Body text                    |
| `text-muted`    | `#6b6b6b` | Metadata, dates, hints       |

## Project Structure

```
src/
├── components/
│   ├── Nav.astro           # Top nav (sticky, mobile hamburger)
│   ├── Footer.astro        # GitHub / LinkedIn / email links
│   ├── Terminal.astro      # Interactive CLI on homepage
│   ├── ProjectCard.astro   # GitHub repo card
│   ├── BlogCard.astro      # Blog post preview card
│   └── LabCard.astro       # Lab project preview card
├── content/
│   └── blog/               # Markdown blog posts (.md files)
├── data/
│   ├── featured.ts         # Repo names to pin on projects page
│   └── books.ts            # Reading list data
├── lab/
│   ├── meta.ts             # Lab project metadata types
│   ├── registry.ts         # Manifest of all lab projects
│   ├── url.ts              # URL helpers (labUrl, etc.)
│   ├── api.ts              # Endpoint wrappers (handler, readBody)
│   ├── kv.ts               # KV storage client
│   ├── rateLimit.ts        # Rate limiting helper
│   └── LabLayout.astro     # Default layout for lab projects
├── layouts/
│   ├── BaseLayout.astro    # HTML shell with nav + footer
│   └── BlogLayout.astro    # Layout for individual blog posts
├── pages/
│   ├── index.astro         # Homepage (hero + terminal)
│   ├── about.astro         # Resume / skills / experience
│   ├── projects.astro      # GitHub projects grid
│   ├── blog/
│   │   ├── index.astro     # Blog post listing
│   │   └── [...slug].astro # Individual blog post
│   ├── lab/
│   │   ├── index.astro     # Lab projects listing
│   │   └── hello/          # Reference example project
│   └── reading.astro       # Reading list
└── styles/
    └── global.css          # Base styles, shared component classes
scripts/
├── new-lab.mjs             # Create new lab project
├── lab-isolation.mjs       # Isolation checker
└── vercel-routes.mjs       # Inserts subdomain route before filesystem (runs in `npm run build`)
templates/
└── lab/                    # Lab project templates (basic, api)
```

## Key Config Files

- `astro.config.mjs` — site URL, base path (`/`), integrations
- `tailwind.config.mjs` — color tokens, typography plugin config
- `tsconfig.json` — TypeScript config with `@/*` path alias for `src/`
- `vercel.json` — only pins `buildCommand`; routes come from the adapter plus `scripts/vercel-routes.mjs`
- `templates/lab/` — lab project templates (basic, api)

## Blog Posts

Posts are managed in Notion. Publishing workflow:

1. Open your Notion blog database
2. Create a new page — fill in Name, Date, Tags, Excerpt, and body content
3. Set **Status** to `Published` (must be a **Select** field type, not the native Status type)
4. The site rebuilds nightly at midnight US Central (6am UTC) automatically
5. For immediate publish: go to GitHub → Actions → "Nightly Rebuild" → Run workflow

**Notion database fields:**
| Field | Type | Notes |
|---|---|---|
| Name | Title | Post title → URL slug |
| Date | Date | Publish date |
| Tags | Multi-select | e.g. engineering, leadership |
| Excerpt | Text | One-liner shown on blog index card |
| Status | **Select** | Options: `Published`, `Draft` — must be Select type, not Status type |
| (page body) | Notion blocks | Full post content |

**Local dev with Notion:**
Create a `.env` file in the project root (already gitignored) and fill in:
- `NOTION_TOKEN` — from your Notion integration settings (notion.so/my-integrations)
- `NOTION_DATABASE_ID` — the 32-char ID from the database URL

If these are not set, the build skips Notion and shows "No posts yet."

## Featured Projects

Edit `src/data/featured.ts` — add GitHub repo names to pin them at the
top of the projects page with a "featured" badge:

```ts
export const featuredRepos: string[] = ['repo-name', 'another-repo'];
```

## Reading List

Edit `src/data/books.ts`. Each book has:
```ts
{
  title: string;
  author: string;
  year?: number;    // year read
  take?: string;    // your short opinion
  status: 'reading' | 'read' | 'want';
}
```

## Blog & Reading Status

- **Blog** — live. Posts managed in Notion database, fetched at build time. Linked in nav, homepage CTA, and terminal.
- **Reading** — still hidden. To enable: uncomment `{ label: 'Reading', href: '/reading' }` in
  `Nav.astro`, `<a href="/reading" ...>Reading List</a>` in `index.astro`, and add `reading: '/reading'`
  to the `open` routes in `Terminal.astro`.

## Updating Personal Info

- **Email / social links**: `src/components/Footer.astro` and `src/pages/about.astro`
- **Resume content** (jobs, skills, education): `src/pages/about.astro`
- **Terminal content** (whoami, experience, contact): `src/components/Terminal.astro`

## GitHub API — Projects Page

No token used. Fetches `https://api.github.com/users/isaacdessert/repos`
at build time using the unauthenticated public API (60 req/hr limit, fine
for a static build). Forks and archived repos are filtered out automatically.

## Base Path

The site is served from the domain root (`base: '/'`). All internal links use
root-relative paths (`/about`, `/projects`, etc.).

## Status & TODOs

**Status:** Lab platform live (merged 2026-09-28). `/lab/hello` and `hello.isaacdessert.dev` verified in production (page, subdomain route, Redis counter, rate limit).

**TODOs:**
- [x] Domain corrected to isaacdessert.dev (was mistakenly isaacjdessert.dev)
- [x] Vercel: confirm project is Git-connected to `isaacdessert/portfolio` (auto-deploy `main`, previews on branches)
- [x] Vercel: set `NOTION_TOKEN` / `NOTION_DATABASE_ID` for Production + Preview
- [x] Vercel: create Deploy Hook on `main`; save URL as GitHub secret `VERCEL_DEPLOY_HOOK`
- [x] GitHub: disable Pages (Settings → Pages) once Vercel is confirmed serving the domain
- [x] Lab system design — spec: `docs/superpowers/specs/2026-09-26-lab-platform-design.md`
- [x] Lab platform built and live (plan: `docs/superpowers/plans/2026-09-26-lab-platform.md`; tasks 1–12 + final-review fixes)

**Open follow-ups:**
- [ ] Set a monthly budget/cap in Upstash (and on any paid API before using it in a lab endpoint)
- [ ] Local `.env` holds `[SENSITIVE]` placeholders for Redis/Notion — re-pull in a normal terminal or paste real values to use them in `npm run dev`
- [ ] `public/og-default.png` doesn't exist but `BaseLayout` references it (link previews have no image)
- [ ] Spec §9 still names `vercel-rewrites.test.ts`; it's now `scripts/vercel-routes.test.ts`
- [ ] Optional: make unknown subdomains 404 instead of falling back to the main site
- [ ] Optional: derive `SITE_ORIGIN` from one source instead of duplicating `astro.config.mjs` `site`
- [ ] Optional: delete the merged `feat/lab-platform` branch (local + GitHub)
