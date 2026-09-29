# Portfolio — Claude Context

Isaac Dessert's personal site: **https://isaacdessert.dev** (no "j" in the domain; the email
`isaacjdessert@gmail.com` does have one). Portfolio, resume, Notion-backed blog, reading list, and a
**lab** for shipping small projects at `/lab/<slug>` and `<slug>.isaacdessert.dev`.

## Commands

```bash
npm install
npm run dev        # http://localhost:4321/
npm test           # vitest: unit tests + lab isolation check
npm run build      # isolation check → astro build → scripts/vercel-routes.mjs (output: .vercel/output/)
npm run new <slug> # scaffold a lab project (add `-- --api` for a rate-limited endpoint)
```

Local secrets: `vercel env pull .env --environment=preview` (the Development environment has no
variables). Values that come back as `[SENSITIVE]` were withheld by Vercel — re-pull in a normal
terminal or paste real values; without them Notion posts and Redis don't load locally.

## Architecture

- **Astro 5, static by default**, deployed on **Vercel** via `@astrojs/vercel`. A page/endpoint with
  `export const prerender = false` becomes a serverless function (only lab APIs do this today).
- **Tailwind 3** (+ typography plugin), self-hosted fonts via Fontsource, imported in `BaseLayout.astro`:
  Inter 400/600/700, JetBrains Mono 400/600/700. Using a new weight (e.g. `font-medium`) means adding its import.
- **Blog**: Notion database → custom Content Layer loader (`src/lib/notionLoader.ts`) at build time.
- **Projects page**: GitHub REST API at build time (public, no token). Pin repos in `src/data/featured.ts`.
- **Resume data**: `src/data/resume.ts` is the single source for the About page and the homepage terminal.
- **Reading list**: `src/data/books.ts` → `/reading`.
- **Lab**: shared code in `src/lab/` (`@lab/*`), projects in `src/pages/lab/<slug>/`, Upstash Redis for
  KV + rate limiting.
- **SEO**: canonical + OG tags in `BaseLayout.astro` (default image `public/og-default.png`),
  `@astrojs/sitemap`, `public/robots.txt`.

```
src/
  components/   Nav, Footer, Terminal (homepage CLI), ProjectCard, BlogCard, LabCard
  data/         resume.ts, books.ts, featured.ts
  lab/          meta, registry, url, api, kv, rateLimit, LabLayout.astro (+ tests)
  layouts/      BaseLayout (shell/SEO; absoluteLinks/noindex/bare props), BlogLayout
  lib/          notionLoader, slug, readTime (+ tests)
  pages/        index, about, projects, reading, blog/, lab/ (index + hello/)
  content/      config.ts (blog collection → Notion loader)
scripts/        new-lab.mjs, lab-isolation.mjs, vercel-routes.mjs (+ tests)
templates/lab/  basic/, api/ (used by `npm run new`)
```

## Deployment

- Push to `main` → production. Any other branch → preview URL (behind Vercel login; from the CLI use
  `vercel curl <path> --deployment <url>`).
- Nightly rebuild (midnight US Central) picks up new Notion posts: `.github/workflows/nightly-rebuild.yml`
  POSTs the `VERCEL_DEPLOY_HOOK` secret. Run it manually from GitHub Actions to publish immediately.
- Env vars live in Vercel → Settings → Environment Variables (Production + Preview):
  `NOTION_TOKEN`, `NOTION_DATABASE_ID`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`.
- Domain and DNS are on Vercel: `isaacdessert.dev` + wildcard `*.isaacdessert.dev`.

## Content workflows

- **Blog post**: add a page to the Notion database with Name, Date, Tags, Excerpt, and
  **Status = `Published`** (Status must be a *Select* property, not Notion's native Status type). Live
  after the nightly rebuild, or run the workflow. Slug = title lowercased/hyphenated. Missing Date → the
  page's creation date.
- **Resume / terminal**: edit `src/data/resume.ts`. Terminal-only copy (whoami blurb) is in `Terminal.astro`.
- **Reading list**: edit `src/data/books.ts` (`status: 'reading' | 'read' | 'want'`).
- **Featured repos**: add names to `src/data/featured.ts`.

## Lab platform

```bash
git checkout -b lab/<slug>
npm run new <slug>              # page + _meta.ts  (-- --api adds a rate-limited endpoint)
npm run dev                     # /lab/<slug>/
git push -u origin lab/<slug>   # preview; merge to main → isaacdessert.dev/lab/<slug> + <slug>.isaacdessert.dev
```

- `_meta.ts` status: `wip` (listed, badge), `live`, `unlisted` (reachable, hidden, noindex).
  Reference project: `src/pages/lab/hello/` (page + Redis counter API).
- **Isolation (enforced by `npm test` and `npm run build`)**: a project imports only its own folder,
  `@lab/*`, or npm packages. Shared code goes in `src/lab/` only when intentionally shared. Only
  `src/pages/lab/index.astro` may import `@lab/*` from portfolio code. npm deps are shared — needing a
  conflicting version means it's time to graduate the project to its own repo.
- Pages use `LabLayout` (`fullscreen` for games/canvases). Link with `labUrl(slug, path)` — never
  relative paths (they break on subdomains). `siteUrl()`/nav links always point at production.
- `_`-prefixed files/dirs are ignored by the router (`_components/`, `_lib/`).
- Endpoints: `api/<name>.ts`, `export const prerender = false`, wrap in `handler()`, validate with
  `readBody(request, schema)` (`import { z } from 'astro/zod'`). Call them with **JSON** bodies.
- Anything calling a paid API **must** `rateLimit()` first (keys on `x-forwarded-for`, set by Vercel).
- State: `kv('<slug>')` — keys auto-prefixed `lab:<slug>:`.
- Secrets: project-specific vars prefixed with the slug (`PIXEL_GARDEN_API_KEY`), read via `requireEnv()`.
- Storage beyond Redis: Vercel Marketplace (Neon Postgres, Blob), then `vercel env pull`.
- Graduate a project: own repo + Vercel project, add `<slug>.isaacdessert.dev` there (explicit domain
  beats the wildcard), delete the lab folder.

## Gotchas

- **Subdomain routing** is inserted into `.vercel/output/config.json` *before* Vercel's filesystem
  check by `scripts/vercel-routes.mjs`. `vercel.json` `rewrites` can't do it (the adapter writes its own
  config, and rewrites run after static files), so `vercel.json` only pins `buildCommand`. Passthrough:
  `/_astro/ /_image /_server-islands/ /_vercel/ /lab/ /favicon.svg`. Production only.
- **Subdomain misses fall back** to the main site instead of 404 (`nope.isaacdessert.dev` → homepage).
  Harmless; canonicals point at the apex.
- **Astro's origin check** 403s bodiless/form POSTs on Vercel ("Cross-site POST form submissions are
  forbidden") — send JSON.
- The site origin is set in two places: `site` in `astro.config.mjs` and `SITE_ORIGIN` in `src/lab/url.ts`.
- `vercel link` appends `.vercel`/`.env*` to `.gitignore`; the existing rules already cover them — drop
  the additions.

## Design tokens

`bg-primary #0d0d0d` (page) · `bg-surface #1a1a1a` (cards/nav) · `accent-yellow #f5e642` (headings,
CTAs) · `accent-green #39ff14` (tags, active) · `text-primary #e8e8e8` · `text-muted #6b6b6b`.
Mono (`font-mono`) for UI chrome; defined in `tailwind.config.mjs`.

## Decision log

- **2026-09 hosting**: moved GitHub Pages → Vercel (domain was already on Vercel; serverless functions
  and previews for the lab). GitHub Pages is unpublished.
- **Lab design**: one Astro app, routes first + automatic subdomains, strict per-project isolation with a
  single shared space. Spec: `docs/superpowers/specs/2026-09-26-lab-platform-design.md`.
- **Redis**: Upstash free tier (KV + rate limiting); code only connects on first use.
- **Cleanup (2026-09-28)**: shared resume data, self-hosted fonts, OG image, sitemap, `/reading`
  enabled, finished plan docs removed (git history keeps them).

## Status & TODOs

**Status:** Live. Cleanup phase 1 merged; phase 2 (Astro 7 upgrade for security advisories) next.

- [ ] Astro 5 → 7 + `@astrojs/vercel` 11 (fixes open Astro advisories; needs Node ≥ 22.12 on Vercel;
      replaces `@astrojs/tailwind`)
- [ ] Set a monthly budget/cap in Upstash (and on any paid API before a lab endpoint uses it)
- [ ] Optional: unknown subdomains → 404 instead of the main site
- [ ] Optional: single source for the site origin
