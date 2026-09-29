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

- **Astro 7, static by default**, deployed on **Vercel** via `@astrojs/vercel` 11 (Node ≥ 22.12; Vercel
  builds on 24.x). A page/endpoint with
  `export const prerender = false` becomes a serverless function (only lab APIs do this today).
- **Tailwind 3** (+ typography plugin) via `postcss.config.mjs` (no `@astrojs/tailwind`), self-hosted fonts via Fontsource, imported in `BaseLayout.astro`.
  Weights imported: Inter 400/500/600/700 (500 is used by the typography plugin's links), JetBrains Mono
  400/600/700. A new weight needs its import.
- **Blog**: Notion database → custom Content Layer loader (`src/lib/notionLoader.ts`) at build time.
- **Projects page**: GitHub REST API at build time (public, no token). Pin repos in `src/data/featured.ts`.
- **Resume data**: `src/data/resume.ts` is the single source for the About page, the homepage terminal,
  and the footer's contact links.
- **Reading list**: Notion database → custom Content Layer loader (`src/lib/notionBooksLoader.ts`) at build time.
- **Lab**: shared code in `src/lab/` (`@lab/*`), projects in `src/pages/lab/<slug>/`, Upstash Redis for
  KV + rate limiting.
- **SEO**: canonical + OG tags in `BaseLayout.astro`. Every page gets its own 1200×630 OG preview
  card, rendered at build time by `src/pages/og/[...slug].png.ts` (Satori → `@resvg/resvg-js`,
  JetBrains Mono/Inter `.woff` files read from Fontsource). `src/lib/og/path.ts`'s `ogImageFor()`
  maps a pathname to its card's path (a lab project's or blog post's sub-pages share its card);
  `src/data/pageMeta.ts` is the single source for the static pages' (about/projects/blog/reading/lab)
  titles and descriptions, feeding both `BaseLayout` and their OG cards. Home keeps
  `public/og-default.png` (1200×630, generated once with sharp from an SVG, no script kept).
  `@astrojs/sitemap`, `public/robots.txt`; `unlisted` lab pages are filtered out of the sitemap via
  `scripts/unlisted-lab.mjs`. `scripts/check-og.mjs` runs at the end of `npm run build` and fails it
  if any page's `og:image` doesn't resolve to a file in the static output.

```
src/
  components/   Nav, Footer, Terminal (homepage CLI), ProjectCard, BlogCard, LabCard
  data/         resume.ts, featured.ts, pageMeta.ts (static pages' titles/descriptions)
  lab/          meta, registry, url, api, kv, rateLimit, slug-rules.mjs, LabLayout.astro (+ tests)
  layouts/      BaseLayout (shell/SEO; absoluteLinks/noindex/bare props), BlogLayout
  lib/          notionLoader, notionBooks, notionBooksLoader, slug, readTime, og/ (card, path) (+ tests)
  pages/        index, about, projects, reading, 404, blog/, lab/ (index + hello/, injuries/),
                og/[...slug].png.ts (per-page OG cards)
  content.config.ts  blog collection → Notion loader
scripts/        new-lab.mjs, lab-isolation.mjs, vercel-routes.mjs, unlisted-lab.mjs, check-og.mjs (+ tests)
templates/lab/  basic/, api/ (used by `npm run new`)
```

## Deployment

- Push to `main` → production. Any other branch → preview URL (behind Vercel login; from the CLI use
  `vercel curl <path> --deployment <url>`).
- Nightly rebuild (midnight US Central) picks up new Notion posts: `.github/workflows/nightly-rebuild.yml`
  POSTs the `VERCEL_DEPLOY_HOOK` secret. Run it manually from GitHub Actions to publish immediately.
- Env vars live in Vercel → Settings → Environment Variables (Production + Preview):
  `NOTION_TOKEN`, `NOTION_DATABASE_ID`, `NOTION_BOOKS_DATABASE_ID`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`.
- Domain and DNS are on Vercel: `isaacdessert.dev` + wildcard `*.isaacdessert.dev`.

## Content workflows

- **Blog post**: add a page to the Notion database with Name, Date, Tags, Excerpt, and
  **Status = `Published`** (Status must be a *Select* property, not Notion's native Status type). Live
  after the nightly rebuild, or run the workflow. Slug = title lowercased/hyphenated. Missing Date → the
  page's creation date.
- **Resume / terminal**: edit `src/data/resume.ts` (also feeds the footer's contact links). Terminal-only
  copy (whoami blurb) is in `Terminal.astro`.
- **Reading list**: add a row to the Notion "Reading List" database (Title, Author, Status —
  `Reading`/`Read`/`Want` (Select), Year, Take, Link). Live after the nightly rebuild, or run the
  workflow. Sort order is year descending then title A→Z; the title column is found by property type,
  not by name.
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
- Projects: hello (reference: page + Redis counter), injuries (ESPN injury feed, 10-min KV cache +
  last-good fallback; unofficial source, OK to break).
- A project's tests may live in its own `_lib/` folder, colocated with the code they cover.
- **Isolation (enforced by `npm test` and `npm run build`)**: a project imports only its own folder,
  `@lab/*`, or npm packages. Shared code goes in `src/lab/` only when intentionally shared. Only
  `src/pages/lab/index.astro` and `src/pages/og/[...slug].png.ts` (reads each project's
  title/description/tags to render its OG card) may import `@lab/*` from portfolio code. npm deps
  are shared — needing a conflicting version means it's time to graduate the project to its own repo.
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
  `/_astro/ /_image /_server-islands/ /_vercel/ /lab/ /favicon.svg /robots.txt /sitemap* /og-default.png`.
  Production only.
- **404s** are the prerendered, noindex `src/pages/404.astro`: the adapter appends a `^/.*$ → /404.html`
  catch-all after the filesystem check (static, no function). Unknown subdomains (`nope.isaacdessert.dev`)
  rewrite to `/lab/nope/`, miss the filesystem, and should land on it too (route order checked in
  config.json; not yet confirmed on production).
- **Astro's origin check** 403s bodiless/form POSTs on Vercel ("Cross-site POST form submissions are
  forbidden") — send JSON.
- `compressHTML: true` in `astro.config.mjs`: Astro 7 defaults to `'jsx'` whitespace stripping; kept
  `true` to preserve spacing.
- `vite.build.cssTarget` is pinned to Vite 6's default (`es2020, edge88, firefox78, chrome87, safari14`):
  Vite 7+'s baseline target makes Lightning CSS emit range media queries that older Safari ignores.
- The site origin is set in two places: `site` in `astro.config.mjs` and `SITE_ORIGIN` in `src/lab/url.ts`.
- `vercel link` appends `.vercel`/`.env*` to `.gitignore`; the existing rules already cover them — drop
  the additions.
- **Social platforms cache OG previews** aggressively (per-URL, keyed off the URL not the image
  content). After changing a page's title/description or its card, use LinkedIn's Post Inspector
  (or the equivalent debugger for the platform you're checking) to force a refetch before resharing.
- **`npm audit`: 2 accepted moderate findings**, from `satori`@^0.33 → `@shuding/opentype.js` →
  `fflate` 0.7.x. `fflate` *is* actively used here — Satori's font parser calls it to decompress
  WOFF table data — but the advisory (GHSA-px8p-9vwx-vf98) is a malformed-ZIP64 infinite loop in
  `fflate`'s `unzipSync`, a path nothing in this codebase calls; our only input to it is our own
  bundled Fontsource `.woff` files, read at build time. Accepted, no action needed. Do **not** try
  to silence it with an `overrides` pin to `fflate@^0.8.x` — confirmed (2026-09-29) that it breaks
  Satori's WOFF glyph decoding: every OG card renders with all text as tofu/replacement-glyph boxes,
  and none of the existing tests catch it (`card.test.ts` only checks the PNG signature and pixel
  dimensions, not that glyphs render).

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
- **Per-page OG cards (2026-09-29)**: replaced the single generic `og-default.png` (still used for
  home and 404) with a card per page/post/project, rendered at build time with Satori + resvg from
  each page's own title/description.

## Status & TODOs

**Status:** Live on Astro 7 (verified in production 2026-09-29: all pages, lab subdomain, branded 404 for unknown paths/subdomains, `npm audit` clean).

- [ ] Verify per-page OG cards on production (LinkedIn Post Inspector) after the first deploy of this branch
- [ ] Set a monthly budget/cap in Upstash (and on any paid API before a lab endpoint uses it)
- [ ] Optional: pin `engines.node` to `>=22.12.0 <25` so Vercel doesn't auto-jump Node majors
- [ ] Optional: replace deprecated `z.ZodTypeAny` in `src/lab/api.ts`; add a type-check step (`astro check`)
- [ ] Optional: single source for the site origin
- [ ] Optional: Tailwind 4 migration (visual-risk; separate)
