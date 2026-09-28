# Portfolio Site — Claude Context

Personal portfolio site for Isaac Dessert (Lead Software Engineer).
Built with Astro + Tailwind CSS, hosted on Vercel at https://isaacjdessert.dev.

## Local Development

```bash
npm install
npm run dev       # http://localhost:4321/
npm run build     # production build to dist/
```

## Deployment

Vercel Git integration: push to `main` → production deploy to isaacjdessert.dev.
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
function instead.

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
- `rateLimit()` keys on `x-forwarded-for`, which Vercel's edge sets; don't trust it if the site ever moves off Vercel.
- State: `kv('<slug>')` — keys are auto-prefixed `lab:<slug>:`.

### Secrets

- Add in Vercel → Settings → Environment Variables (Production + Preview), then `vercel env pull .env --environment=preview`.
- If pulled values show as `[SENSITIVE]`, Vercel withheld them (sensitive vars, or the CLI redacting inside an AI session). Re-run the pull in a normal terminal, or paste the Upstash REST URL/token from the Upstash console into `.env`. Deployed environments are unaffected.
- Project-specific: prefix with the slug in UPPER_SNAKE (`PIXEL_GARDEN_API_KEY`); read with `requireEnv()`.
- Shared (intentional): `KV_REST_API_URL`, `KV_REST_API_TOKEN` (Upstash), `ANTHROPIC_API_KEY` when added.
- Set a monthly spend cap in each paid API's console.

### Adding storage

- Postgres: Vercel Marketplace → Neon → connect to project → `vercel env pull .env --environment=preview`.
- File uploads: Vercel → Storage → Blob → connect → `vercel env pull .env --environment=preview`.
- Wrap either in a shared `src/lab/` helper only once a second project needs it.

### Subdomains

`vercel.json` rewrites `<slug>.isaacjdessert.dev/*` → `/lab/<slug>/*` (production only; `/_astro/`,
`/lab/`, `/favicon.svg` pass through). The wildcard domain is configured in Vercel → Domains.

### Graduating a project

When a project needs its own dependencies, runtime (WebSockets → Fly.io), or it just gets big: move it
to its own repo and Vercel project, add `<slug>.isaacjdessert.dev` as an explicit domain there (explicit
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
├── scripts/
│   ├── new-lab.mjs         # Create new lab project
│   └── lab-isolation.mjs    # Isolation checker
└── styles/
    └── global.css          # Base styles, shared component classes
```

## Key Config Files

- `astro.config.mjs` — site URL, base path (`/`), integrations
- `tailwind.config.mjs` — color tokens, typography plugin config
- `tsconfig.json` — TypeScript config with `@/*` path alias for `src/`
- `vercel.json` — subdomain rewrites for lab projects
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

**Status:** Lab platform built on `feat/lab-platform`; awaiting preview check and production smoke test.

**TODOs:**
- [x] Vercel: confirm project is Git-connected to `isaacdessert/portfolio` (auto-deploy `main`, previews on branches)
- [x] Vercel: set `NOTION_TOKEN` / `NOTION_DATABASE_ID` for Production + Preview
- [x] Vercel: create Deploy Hook on `main`; save URL as GitHub secret `VERCEL_DEPLOY_HOOK`
- [x] GitHub: disable Pages (Settings → Pages) once Vercel is confirmed serving the domain
- [x] Lab system design — spec: `docs/superpowers/specs/2026-09-26-lab-platform-design.md`
- Lab platform build (plan: `docs/superpowers/plans/2026-09-26-lab-platform.md`):
  - [x] Task 1: test config, `@lab` alias, slug rules, metadata
  - [x] Task 2: URL helpers + project registry
  - [x] Task 3: API helpers
  - [x] Task 4: KV + rate limiting
  - [x] Task 5: isolation checker
  - [x] Task 6: BaseLayout options + LabLayout
  - [x] Task 7: /lab index, nav, terminal
  - [x] Task 8: templates + `npm run new`
  - [x] Task 9: subdomain rewrite
  - [x] Task 10: `/lab/hello` starter project
  - [x] Task 11: docs + preview deploy
  - [ ] Task 12: production smoke test
