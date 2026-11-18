# Research: building a production site on the portfolio's server

**Date:** 2026-11-18 · **Read from:** branch `lab/atlas` (13 commits ahead of `origin/main` at `e13f65c`;
`src/lab/`, `scripts/`, `templates/`, `astro.config.mjs` and `vercel.json` match `origin/main`, only
`package.json` differs, by the atlas deps). `npm test` passed on this branch: 31 files, 246 tests.
**Method:** repo source and config, installed packages (versions from `package-lock.json`), read-only
production requests (DNS, `GET` of static pages, one `OPTIONS` preflight that writes no state), and
official Vercel/Upstash/Astro docs fetched today. Claims I inferred rather than read are marked
**(inferred)**.

## Question

Isaac wants to build a new website, launch it to production, and have it "leverage an existing
server": the production deployment of this portfolio (isaacdessert.dev on Vercel). What does that
server actually provide, what does it constrain, what does it lack, and which concrete ways of building
on it are open: a lab project, a separate site calling its APIs, a separate site sharing its Redis, or
something else?

## TL;DR

- **The "server" is one Vercel project running a static Astro 7.3.5 build.** All server code runs in a
  single Node function, `_render`, which handles every route marked `export const prerender = false`.
  Today that is one route: `/lab/injuries/api/feed`. There is no middleware, no SSR page, no cron, and
  no database beyond one Upstash Redis.
- **Server-side building blocks exist only inside the lab.** They are `handler()` (JSON error shapes),
  `readBody()` + zod, `rateLimit()` (per-IP sliding window), `kv(slug)` (5 Redis ops, keys prefixed
  `lab:<slug>:`), and `requireEnv()`. There are **no CORS headers, no auth, no sessions or users, and
  no relational DB or blob store**. A CORS preflight to the live API returns **404** (observed).
- **Vercel plan: Hobby** (`vercel teams ls` after login, 2026-11-18: team
  `dessertedstudios-9798's projects`, plan `hobby`). The Terms §4 say Hobby is for "personal or
  non-commercial use" only. Other Hobby limits: 300 s max function
  duration, 4.5 MB request/response body, 1M invocations/month, 1 hour of runtime logs, no Spend
  Management. **Upstash Free:** 500K commands/month, 250 MB, 1 DB. Budgets exist only on
  pay-as-you-go, so the CLAUDE.md TODO "set a monthly budget/cap in Upstash" can't be done on the
  Free tier.
- **(a) New site as a lab project:** works today with the least new code (multi-page, own APIs, KV,
  rate limit, `<slug>.isaacdessert.dev`). The costs: `LabLayout` brands it as the portfolio's
  (nav/footer or a "← lab" link, " | Isaac Dessert" titles, canonical on the apex, portfolio
  favicon/robots/sitemap/404), and it shares the portfolio's build, npm deps and quotas. Best fit for a
  personal, mostly-static site.
- **(b) Own repo calling the lab APIs cross-origin:** **not workable from a browser today** (no CORS,
  OPTIONS → 404). Server-to-server calls do work, but every user then shares the calling server's
  IP-keyed rate-limit bucket, and the endpoints have no auth. CORS and API auth would have to be built
  first.
- **(c) Own repo sharing the same Upstash Redis:** workable with configuration only (connect the
  existing Marketplace resource to a second project). It shares only data and the free quota, behind
  one DB-wide token with no isolation. This is in effect the documented graduation path plus shared
  data.
- **(d) Other:** the most plausible is pointing a **custom domain at the portfolio project and mapping
  it to a lab project** with an extra host rule in `scripts/vercel-routes.mjs`. That is a small routing
  change, plus SEO work (canonical, robots, sitemap, favicon). Vercel Microfrontends and proxy rewrites
  are possible but unverified here.
- **Could not verify:** the actual Vercel env vars and protection settings, whether
  function responses get CORS headers from Vercel, how on-demand (SSR) pages behave behind the
  subdomain rewrite, and the "explicit domain beats wildcard" precedence (not found in the docs I
  fetched).

---

## 1. What the server is

| Aspect | Finding | Source |
|---|---|---|
| Framework | Astro **7.3.5** | `package-lock.json`; `package.json:27` |
| Output mode | `output: 'static'`, `adapter: vercel()` | `astro.config.mjs:15-16` |
| Adapter | `@astrojs/vercel` **11.0.11** | `package-lock.json`; `package.json:15` |
| Site origin | `site: 'https://isaacdessert.dev'`, and separately `SITE_ORIGIN` | `astro.config.mjs:9`; `src/lab/url.ts:1` |
| Vercel project | `isaac-dessert-portfolio`, orgId `team_VIHu…` | `.vercel/repo.json` (gitignored) |
| Default function region | `iad1` (Vercel default); responses show `x-vercel-id: iad1::…` | [Functions limits](https://vercel.com/docs/functions/limitations); observed 2026-11-18 |

**How a route becomes a function.** In static mode every page prerenders. For any route that is not
prerendered, the adapter builds **one** serverless folder, `functions/_render.func`, and emits a route
`{ src: <route regex>, dest: "_render" }`
(`@astrojs/vercel` 11.0.11, `dist/index.js:326-333`). The last local build (2026-10-06, gitignored)
shows exactly one such route, `^/lab/injuries/api/feed/?$ → _render`
(`.vercel/output/config.json:33-35`). So every lab endpoint across all projects shares one function
bundle, its cold starts, and the 250 MB bundle limit **(inferred from the single `_render` folder)**.

**Runtime / Node.** The adapter picks the function runtime from the **build machine's** Node major:
24 is the default, 20/22 are "available", 18 is deprecated, and any other version falls back to 24
(`dist/index.js:34-47, 521-536`). The local build wrote `"runtime": "nodejs24.x"`, with
`supportsResponseStreaming: true` (`.vercel/output/functions/_render.func/.vc-config.json`).
`engines.node` is `>=22.12.0` with no upper bound (`package.json:44-45`). Pinning it is an open TODO
(`CLAUDE.md:178`).

**Function config not set.** There is no `maxDuration`, so the Vercel default applies: 300 s on every
plan. The adapter accepts `maxDuration` (`dist/index.js:93-108`). The adapter's `isr` option only
takes effect when `output` is `'server'` (`dist/index.js:283`), so ISR is unavailable in this config
**(inferred)**. There is no `src/middleware.*`; Astro looks for `src/middleware`
(`astro` 7.3.5, `dist/core/constants.js:25`). Sessions are not configured, and the Vercel adapter
ships no default session driver ([Astro sessions docs](https://docs.astro.build/en/guides/sessions/)).

**Build pipeline** (`package.json:7`; `vercel.json:3` pins `buildCommand: npm run build` so Vercel
runs it):

1. `vitest run scripts/lab-isolation.test.ts`: the build fails on an import-rule violation
   (`scripts/lab-isolation.test.ts:46-48`).
2. `astro build`: prerenders pages and the OG cards. Build-time data sources fail soft: Notion skips
   when its env vars are missing or the call errors (`src/lib/notionLoader.ts:14-16, 31-33`), and the
   GitHub repos fetch is guarded (`src/pages/projects.astro:23, 30, 44`).
3. `node scripts/vercel-routes.mjs`: inserts the subdomain rewrite just before
   `{ handle: "filesystem" }` and throws if that handle is missing (`scripts/vercel-routes.mjs:16-23`).
4. `node scripts/check-og.mjs`: exits 1 if any page's `og:image` doesn't resolve to a static file
   (`scripts/check-og.mjs:75-80`).

**Final route order** (`.vercel/output/config.json:3-41`): `_astro` immutable cache header → **lab
subdomain rewrite** → `filesystem` → `_server-islands`/`_image`/API → `^/.*$ → /404.html (404)`. The
adapter writes this file itself, with `rewrites: []` and only the `_astro` cache header
(`dist/index.js:370-372, 422-426`). That is why routing changes go through `vercel-routes.mjs`, not
`vercel.json` (`CLAUDE.md:123-127`). Whether `vercel.json` `headers` would be honoured alongside this
config is **unverified**. The same reasoning suggests they would not be **(inferred)**.

## 2. The lab platform as a host for a new site

### Scaffolding

- `npm run new <slug> [-- --api]` (`scripts/new-lab.mjs`):
  - It validates the slug: lowercase kebab-case, ≤ 40 chars, not `www`/`api`/`lab`
    (`src/lab/slug-rules.mjs:4-17`). It refuses an existing folder (`new-lab.mjs:42-43`).
  - It copies `templates/lab/basic`, then `templates/lab/api` (`new-lab.mjs:45-47`), and replaces
    `__SLUG__`, `__TITLE__`, `__DATE__` and `__ENV_PREFIX__` (`new-lab.mjs:49-58`).
  - The env prefix is the slug uppercased with `-` → `_` (`new-lab.mjs:20-22`).
- `basic` gives `_meta.ts` (starts `status: 'wip'`, `templates/lab/basic/_meta.ts:7`) and an
  `index.astro` that uses `LabLayout`.
- `api` adds `api/example.ts`: a `POST` with `rateLimit` 20/min and a `readBody` zod schema
  (`templates/lab/api/api/example.ts:6-12`). The page `fetch`es it with a JSON body
  (`templates/lab/api/index.astro:27-35`).

### `_meta.ts` and statuses

- Schema: `title`, `description` (≤ 200 chars), `date` `YYYY-MM-DD`,
  `status: 'live' | 'wip' | 'unlisted'`, `tags` (`src/lab/meta.ts:3-12`).
- The registry globs every `src/pages/lab/*/_meta.ts`. It fails the build if a folder has an
  `index.astro` but no `_meta.ts`, or has an invalid slug (`src/lab/registry.ts:16-38, 48-51`).
- `unlisted`:
  - hidden from `/lab` (`registry.ts:41-45`);
  - `noindex` (`src/lab/LabLayout.astro:23`);
  - dropped from the sitemap via a regex over `_meta.ts` (`scripts/unlisted-lab.mjs:8-18`;
    `astro.config.mjs:6-11`).
- `wip`: listed on `/lab` with a badge (`src/pages/lab/index.astro:21-29`).

### `LabLayout` and what it forces

- Props: only `slug`, `title?`, `description?` and `fullscreen?` (`src/lab/LabLayout.astro:6-12`).
- It always wraps the portfolio's `BaseLayout` (`LabLayout.astro:19-25`). That means:
  - `<title>{title} | Isaac Dessert</title>`, the same on `og:title` and `twitter:title`, and
    `og:site_name` "Isaac Dessert" (`src/layouts/BaseLayout.astro:47, 51, 55, 60`).
  - Canonical = `Astro.site` + pathname, i.e. always `https://isaacdessert.dev/lab/<slug>/…`, even
    when served from the subdomain (`BaseLayout.astro:35, 44`). Observed on production:
    `injuries.isaacdessert.dev/` has canonical `https://isaacdessert.dev/lab/injuries/`.
  - `og:image` = `ogImageFor(pathname)` → `/og/lab/<slug>.png` for every page in the project
    (`src/lib/og/path.ts:7-8`; `BaseLayout.astro:29`). `LabLayout` doesn't expose the `ogImage` prop.
  - The card itself is portfolio-branded: eyebrow `isaacdessert.dev/lab/<slug>`, an "Isaac Dessert"
    label, and title/description/tags taken from `_meta.ts`
    (`src/pages/og/[...slug].png.ts:44-55`; `src/lib/og/card.ts:199`).
  - Portfolio fonts and `global.css` (dark theme, `.btn-primary` etc.) (`BaseLayout.astro:5-12`;
    `src/styles/global.css`), and the favicon `/favicon.svg` (`BaseLayout.astro:64`).
  - Non-fullscreen: the portfolio `Nav` (About/Projects/Blog/Reading/Lab, absolute links) and
    `Footer`, plus a "← lab" link (`LabLayout.astro:33-38`; `src/components/Nav.astro:9-18`).
    Fullscreen: no nav/footer, but a fixed "← lab" link (`LabLayout.astro:26-32`;
    `BaseLayout.astro:67-71`).

### Can a lab project be its own multi-page site?

- **Multiple pages: yes.** Any `.astro` file in the folder is a route (`/lab/<slug>/about`), and
  `_`-prefixed files and folders are ignored by the router (spec §2,
  `docs/superpowers/specs/2026-09-26-lab-platform-design.md:115-124`). Sub-pages share the project's
  one OG card (`path.ts:7-8`).
- **Own nav/head/SEO: only by not using `LabLayout`.** The isolation rules are import-only
  (`scripts/lab-isolation.mjs:56-59`), and nothing checks that a page uses `LabLayout`. So a project
  page can emit its own `<html>`/`<head>` with its own title, canonical and OG tags **(inferred)**.
  - It cannot import `src/styles/global.css` or `BaseLayout` (`lab-isolation.mjs:56-58`). It would
    need its own CSS. Tailwind still works through the shared root config, whose content glob covers
    all of `src/` (`tailwind.config.mjs:5`) **(inferred)**.
  - `check-og` only checks pages that *have* an `og:image`, and requires the image to exist in the
    static output (`scripts/check-og.mjs:43, 52-57`). `/og/lab/<slug>.png` always exists, and an
    image imported from the project folder would land under `/_astro/` **(inferred)**.
  - `CLAUDE.md:109` says "Pages use `LabLayout`". That is a convention, not an enforced rule.
- **Not overridable on the subdomain:** `/favicon.svg`, `/robots.txt`, `/sitemap*` and
  `/og-default.png` pass through to the portfolio's files (`scripts/vercel-routes.mjs:10`). Observed:
  `injuries.isaacdessert.dev/robots.txt` serves the portfolio's, which points at
  `https://isaacdessert.dev/sitemap-index.xml` (`public/robots.txt:4`). Unknown paths fall to the
  portfolio's branded 404 (`src/pages/404.astro:8`). The same content is served at both
  `isaacdessert.dev/lab/<slug>/` and `<slug>.isaacdessert.dev/`.

### URLs and subdomain routing

- `labUrl(slug, path)` → `/lab/<slug>/<path>`, root-relative. It works on both hosts because `/lab/`
  is excluded from the rewrite. `siteUrl(path)` → an absolute URL on the hard-coded production origin
  (`src/lab/url.ts:1-15`).
- The route (`scripts/vercel-routes.mjs:9-13`):
  - `src`: any path except `_astro/`, `_image`, `_server-islands/`, `_vercel/`, `lab/`,
    `favicon.svg`, `robots.txt`, `sitemap`, `og-default.png`.
  - `has`: host `(?<slug>(?!www\.)[a-z0-9-]+)\.isaacdessert\.dev`, i.e. one label, not `www`. The
    tests confirm `a.b.isaacdessert.dev` is not rewritten (`scripts/vercel-routes.test.ts:69-86`).
  - `dest`: `/lab/$slug/$1`.
- **Production only.** The host pattern only matches `*.isaacdessert.dev`, so previews (`*.vercel.app`)
  and `npm run dev` never match (**(inferred)** from the regex; spec line 260; `CLAUDE.md:127`).
- DNS is on Vercel (`ns1/ns2.vercel-dns.com`). An arbitrary name like `nope-zz9.isaacdessert.dev`
  resolves, and returns **404 with the branded page** (observed 2026-11-18).
  - This settles `CLAUDE.md:128-131` ("not yet confirmed on production"), which contradicts the
    status line at `CLAUDE.md:175` ("verified").
- **Unverified risk: on-demand pages on a subdomain.** The adapter entrypoint picks the route with
  `app.match(request)` on the incoming `request.url` (`@astrojs/vercel` 11.0.11,
  `dist/serverless/entrypoint.js:44`).
  - If Vercel passes the *original* path (`/dash`) rather than the rewritten one
    (`/lab/<slug>/dash`), a `prerender = false` page reached through `<slug>.isaacdessert.dev` would
    match the wrong route.
  - It never comes up today: only API routes are on-demand, and they're always called under `/lab/`,
    which isn't rewritten.
  - It can only be tested in production, because previews have no subdomain routing.

### Isolation rules (`scripts/lab-isolation.mjs`)

- **Projects** (`src/pages/lab/<slug>/**`) may import only their own folder, `@lab/*` or npm packages
  (`lab-isolation.mjs:56-59, 83-85`).
- **Shared space** (`src/lab/`) may import only itself, npm, `BaseLayout.astro` and `global.css`
  (`lab-isolation.mjs:15, 61-64`).
- **Portfolio code** may import `@lab/*` only from `src/pages/lab/index.astro` and
  `src/pages/og/[...slug].png.ts` (`lab-isolation.mjs:12-14, 66-71`).
- **Scope and limits:** only files under `src/` with extensions
  `.ts .tsx .js .mjs .astro .svelte .vue` (`lab-isolation.mjs:9, 76`), matched by import-specifier
  regex. It does **not** catch:
  - CSS `@import`;
  - a project importing `@upstash/redis` directly (it's an npm package) and so bypassing key
    prefixing;
  - a project importing the exported `getRedis()` from `@lab/kv` (the restriction is a comment only,
    `src/lab/kv.ts:6`);
  - reading another project's env vars at runtime;
  - files under `public/`.

  (All **(inferred)** from the code.)
- npm deps are shared, one `package.json`. Needing a conflicting version is the documented trigger to
  graduate (`CLAUDE.md:107-108`; spec lines 80-85).
- Discrepancies (the code wins over the spec):
  - The spec puts enforcement in `src/lab/isolation.test.ts` (spec line 63). The code has
    `scripts/lab-isolation.mjs` and `scripts/lab-isolation.test.ts`.
  - The spec's starter `/lab/hello` (spec lines 273-277) was removed in `e13f65c`. The reference
    project is `src/pages/lab/injuries/`.
  - The spec's route regex (lines 247-253) lacks the later `robots.txt`/`sitemap`/`og-default.png`
    passthroughs.

### Reference project: `src/pages/lab/injuries/`

- **Page:** a static page (`LabLayout`, non-fullscreen) whose client script `fetch`es
  `labUrl('injuries','api/feed')` (`src/pages/lab/injuries/index.astro:6-7, 200-207`).
- **API** (`src/pages/lab/injuries/api/feed.ts:6-14`): `prerender = false`, a module-level
  `kv('injuries')`, then `rateLimit` 30/min, then `getFeed`, then `cache-control: no-store`.
- **Cache logic** (`_lib/feed.ts:21-38`): a `fresh` key (600 s TTL); on a miss it fetches ESPN with a
  10 s timeout, writes `fresh` and `last`, and falls back to `last` with `stale: true`, else 502.

## 3. Server-side capabilities available today

All of these live in `src/lab/` and are importable only by lab projects (and the two sanctioned
portfolio readers).

| Helper | Behaviour | Source |
|---|---|---|
| `handler(fn)` | Wraps an `APIRoute`. `HttpError` < 500 → `{ error: message }` + its headers; `HttpError` ≥ 500 → `{ error: 'Internal error' }` (message logged, not sent); `ZodError` → 400 `{ error: 'Invalid request', issues: [{ path, message }] }`; anything else → 500 `{ error: 'Internal error' }` + `console.error` | `src/lab/api.ts:26-53` |
| `json(data, init)` | Sets `content-type: application/json; charset=utf-8` only: no CORS, no cache headers | `src/lab/api.ts:15-19` |
| `readBody(req, schema)` | `request.json()` (bad JSON → 400 `Malformed JSON body`), then `schema.parse`. Typed with deprecated `z.ZodTypeAny` (TODO, `CLAUDE.md:179`). Vercel caps the body at 4.5 MB | `src/lab/api.ts:55-66`; [limits](https://vercel.com/docs/functions/limitations) |
| `readEnv` / `requireEnv` | `process.env[name]`, then `import.meta.env`. Missing → logs the name, throws a 500 (the client sees only `Internal error`) | `src/lab/api.ts:68-81` |
| `kv(slug)` | Lazy Upstash client: env is read and the client built on first call. Keys `lab:<slug>:<key>`. Only `get`, `set` (optional `ex`), `incr`, `del`, `expire`: no hashes/lists/sets/scan/transactions. Env `KV_REST_API_URL`/`KV_REST_API_TOKEN`, with `UPSTASH_REDIS_REST_URL`/`_TOKEN` as fallback (the fallback isn't in CLAUDE.md). Missing → 500 `Redis not configured` | `src/lab/kv.ts:4-18, 28-58` |
| `rateLimit(req, {slug,id,limit,window})` | `@upstash/ratelimit` sliding window, prefix `lab:<slug>:rl:<id>`, identifier = first `x-forwarded-for` entry → `x-real-ip` → `'unknown'` (all unknown callers share a bucket). Over limit → `HttpError(429)` + `Retry-After`. Limiter instances are cached per warm instance | `src/lab/rateLimit.ts:14-43` |

**Rate limiter library defaults** (`@upstash/ratelimit` 2.2.0, `dist/index.js`):

- `timeout` 5000 ms. If Redis doesn't answer in time, `limit()` resolves `success: true`, so the
  limiter **fails open** (lines 767, 925-943, 829).
- An in-memory "ephemeral cache" blocks known-over-limit identifiers without a Redis call, per
  instance (lines 781-785).
- Analytics are off (line 777).
- `@upstash/redis` 1.39.0 retries 5 times by default (`nodejs.js:149-153`).
- On Vercel, `x-forwarded-for` is the client IP, and Vercel "overwrite[s] the X-Forwarded-For header
  and do[es] not forward external IPs" ([request headers](https://vercel.com/docs/headers/request-headers)).
  So a proxy or server calling these endpoints is rate-limited as **one** IP.

**Astro origin check** (`astro` 7.3.5): `security.checkOrigin` defaults to `true`
(`dist/core/config/schemas/defaults.js:44`) and is not overridden in `astro.config.mjs`. The logic is
in `dist/core/app/origin-check.js:8-22`:

| Request to an on-demand route | Result |
|---|---|
| `GET` / `HEAD` / `OPTIONS` | allowed |
| non-safe method, `content-type` is form-like (`x-www-form-urlencoded`, `multipart/form-data`, `text/plain`), cross-origin | **403** `Cross-site <METHOD> form submissions are forbidden` |
| non-safe method, `content-type: application/json`, any origin | allowed |
| non-safe method, **no** `content-type`, `Origin` ≠ request origin | **403** |

So JSON POSTs from another origin pass Astro's check. What blocks browsers is CORS (next point), not
Astro.

**CORS: none.**

- A search for `Access-Control`, `cors`, `defineMiddleware` and `onRequest` across `src/`, `scripts/`
  and `templates/` finds nothing, and there's no `src/middleware.*`.
- An endpoint without an `OPTIONS` export returns a bodiless 404 (`astro` 7.3.5,
  `dist/runtime/server/endpoint.js:8, 20-28`).
- Observed 2026-11-18: an `OPTIONS` preflight to `https://isaacdessert.dev/lab/injuries/api/feed`
  with `Origin: https://example.com` → `HTTP/2 404`, empty body, no `access-control-*` headers.
- Static responses (apex `/`, `injuries.isaacdessert.dev/`) do carry `access-control-allow-origin: *`
  from Vercel's CDN (observed). Whether function responses get it is **unverified**: I didn't `GET`
  the API, because that increments the rate-limit key and can write the KV cache.
- **Net:** a browser on another origin can't call these APIs today. A `POST` with JSON fails the
  preflight; a simple `GET`'s response is unreadable without `Access-Control-Allow-Origin`, and the
  code sets none **(inferred)**.

**Auth / sessions / users:** none. There is no auth library in `package.json`, no cookies, no
`Astro.session`, and no middleware. The lab spec lists auth and analytics as out of scope (spec lines
21-25). The only "identity" is the client IP inside `rateLimit()`.

**Data stores:**

- One Upstash Redis via `kv()`.
- Notion is **build-time only**, through the content loaders (`src/lib/notionLoader.ts`,
  `src/lib/notionBooksLoader.ts`).
- Postgres and Blob are "documented as one-click add-ons, not provisioned" (spec line 24;
  `CLAUDE.md:117`). Nothing in `package.json` references Neon, Postgres, Blob or an ORM.

**Background work:** no Vercel cron in `vercel.json`. The only scheduler is the GitHub Action that
POSTs a deploy hook nightly (`.github/workflows/nightly-rebuild.yml:7, 17-25`).

## 4. Deployment and operations

**Branches and environments**

- Push to `main` → production. Any other branch → a preview URL behind Vercel login
  (`CLAUDE.md:63-64`).
- Vercel's "Standard Protection" protects all deployments except production domains. Password
  Protection is "Not available on Hobby"
  ([deployment protection](https://vercel.com/docs/deployment-protection)). This project's actual
  setting is **unverified** (CLI logged out).
- Previews have no subdomain routing (section 2), and cross-origin calls to protected previews fail
  their preflight ([Vercel CORS guide](https://vercel.com/kb/guide/how-to-enable-cors)).

**Env vars**

- Production + Preview hold `NOTION_TOKEN`, `NOTION_DATABASE_ID`, `NOTION_BOOKS_DATABASE_ID`,
  `KV_REST_API_URL` and `KV_REST_API_TOKEN` (`CLAUDE.md:67-68`). I couldn't list them (logged out).
- Project secrets are prefixed with the slug and read via `requireEnv()` (`CLAUDE.md:116`;
  `templates/lab/api/api/example.ts:5`). Shared keys such as `KV_*` are the intentional exception
  (spec lines 76-78).
- `.env.example` lists only the Notion vars (`.env.example:1-10`).

**Nightly rebuild**

- `cron: '0 6 * * *'` (`nightly-rebuild.yml:7`) is midnight US Central only in standard time. During
  daylight time it's 1 am CDT. The comment says "midnight".
- It redeploys **everything**, including any lab-hosted site.

**Domain and DNS:** the apex plus a wildcard on Vercel DNS (`CLAUDE.md:69`). Confirmed by `dig` (NS
`vercel-dns.com`, arbitrary subdomains resolve).

**Vercel plan: Hobby.**

- The research pass couldn't check (CLI logged out). After `vercel login` on 2026-11-18,
  `vercel teams ls` (CLI 66.1.0) lists one team, `dessertedstudios-9798's projects`, plan `hobby`.
- The `team_` orgId in `.vercel/repo.json` doesn't show the plan by itself, because personal Hobby
  accounts are also converted to "Hobby teams" ([Hobby plan](https://vercel.com/docs/plans/hobby)).

What the plan implies, from the official docs:

| | Hobby | Pro | Source |
|---|---|---|---|
| Commercial use | **"You shall only use the Services under a Hobby plan for your personal or non-commercial use."** Vercel may disable Hobby deployments "with or without notice" | allowed | [Terms §4](https://vercel.com/legal/terms) (last updated 2026-10-19) |
| Price | free | Developer seats $20/user/month | [Hobby plan](https://vercel.com/docs/plans/hobby) |
| Function max duration | 300 s default and max | 300 s default, 800 s max, 1800 s beta | [Functions limits](https://vercel.com/docs/functions/limitations) |
| Function memory | 2 GB / 1 vCPU | up to 4 GB / 2 vCPU | same |
| Request/response body | 4.5 MB (413 `FUNCTION_PAYLOAD_TOO_LARGE`) | same | same |
| Bundle size | 250 MB uncompressed | same | same |
| Included / month | 1M invocations, 4 CPU-hrs Active CPU, 360 GB-hrs memory, 100 GB Fast Data Transfer, 10 GB Fast Origin Transfer, 1M CDN requests | usage-based beyond credit; invocations $0.60/1M | [Hobby plan](https://vercel.com/docs/plans/hobby); [Fair use](https://vercel.com/docs/limits/fair-use-guidelines) |
| Over the limit | "you will have to wait until 30 days have passed before you can use the feature again" | billed on-demand | [Hobby plan](https://vercel.com/docs/plans/hobby) |
| Domains per project | 50 | unlimited | same |
| Deployments per day | 100 | 6,000 | same |
| Runtime log retention | 1 hour | 1 day (30 with Observability Plus) | [Runtime logs](https://vercel.com/docs/logs/runtime) |
| Spend Management | N/A | configurable; can pause production | [Spend management](https://vercel.com/docs/spend-management) |
| WAF custom rules / IP blocks | 3 / 10 | 40 / 40 | [Hobby plan](https://vercel.com/docs/plans/hobby) |
| Cron jobs | once per day, ±59 min | once per minute | [Cron usage](https://vercel.com/docs/cron-jobs/usage-and-pricing) |
| Microfrontends | 2 projects, 50K routed req/month | 2 projects, then $250/project/month | [Microfrontends](https://vercel.com/docs/microfrontends) |

Usage limits are per account/team, so a new site's traffic, whether in this project or another
project on the same team, draws on the same Hobby pool. Exhausting it could pause the portfolio too
**(inferred** from the per-team usage tables).

**Upstash Redis** ([Upstash Redis pricing](https://upstash.com/pricing/redis); the docs URL
`upstash.com/docs/redis/overall/pricing` redirects there):

- **Free:** 250 MB data, 10 GB monthly bandwidth, **500K commands/month**, 1 free DB. The capacity
  table shows 10,000 commands/s, 10 MB max request and 100 MB max record.
- **Budgets:** "Budget is only available for the pay-as-you-go plan." Pay-as-you-go is
  $0.2/100K commands. If usage exceeds the budget cap, "your database will be rate limited".
- The page doesn't say what happens when a **Free** DB exceeds its limits **(unverified)**.
- **Provisioning:** the env names `KV_REST_API_URL`/`KV_REST_API_TOKEN` are the ones the Vercel
  Marketplace Upstash integration injects (`src/lab/kv.ts:12`; spec lines 216-218). So the DB was
  probably provisioned through the Marketplace, which bills "through your Vercel account"
  ([Marketplace storage](https://vercel.com/docs/marketplace-storage)) **(inferred)**. The DB region
  is unknown.
- **Rough budget:** steady state, one injuries API call costs about 2 commands (one `EVALSHA` for the
  limiter plus one `GET`). That's about 250K API calls/month across *all* lab projects before the
  Free cap **(inferred**; I haven't confirmed how Upstash counts `EVALSHA`).

**Monitoring:** the only signal is `console.error` in `handler()` going to Vercel runtime logs (1 hour
on Hobby). There's no analytics, error tracking or uptime check in `package.json` or the code.

## 5. Options for "leveraging the existing server"

### (a) New site as a lab project: `/lab/<slug>` + `<slug>.isaacdessert.dev`

- **Works today:**
  - `npm run new <slug> -- --api`, multi-page routing, JSON APIs with
    `handler`/`readBody`/`rateLimit`/`kv`, slug-prefixed secrets, the subdomain, and a per-project
    OG card.
  - Deploy = merge to `main`. Static pages are served from the CDN.
- **Would need building:**
  - Its own look and SEO, if it shouldn't read as part of the portfolio. Either skip `LabLayout` and
    write a project-local layout (own `<head>`, canonical on the subdomain, own CSS and OG image), or
    extend `LabLayout`/`BaseLayout` with props such as `ogImage`, a title-suffix toggle, canonical
    host and favicon. Extending them is a shared/portfolio change.
  - Subdomain-specific `robots.txt`/sitemap/favicon would need `vercel-routes.mjs` changes, because
    those paths pass through to the portfolio.
  - Richer KV (hashes, lists, scans) means extending `src/lab/kv.ts`.
  - Dynamic/SSR pages need the subdomain-routing question in section 2 answered first.
- **Risks / constraints:**
  - The new site's deploys are the portfolio's deploys: one build, one `package.json`, one isolation
    test, one function bundle. A bad portfolio commit blocks the site and vice versa.
  - Shared Hobby usage pool and shared 500K Redis commands.
  - Content is duplicated at the apex path and the subdomain.
  - Subdomain behaviour is testable only in production.
  - The team is on Hobby, so a commercial site breaks the Terms. Isaac should also confirm that hosting
    CC BY-NC-SA atlas data (`CLAUDE.md:100-102`) in the same deployment is fine if the new site is
    commercial **(inferred concern)**.
- **Repo rules that apply:** isolation (own folder, `@lab/*`, npm only), `labUrl` for links
  (`CLAUDE.md:109-110`), `rateLimit()` before any paid API (`CLAUDE.md:114`), shared npm deps, with
  graduation when they conflict (`CLAUDE.md:107-108`).

### (b) Own repo + Vercel project calling the portfolio's lab APIs cross-origin

- **Works today:**
  - **Server-to-server only.** The new site's own functions can `GET` or JSON-`POST`
    `https://isaacdessert.dev/lab/<slug>/api/*`, since Astro's origin check lets JSON through and
    CORS doesn't apply off-browser.
- **Doesn't work today:**
  - **Browser calls** (no CORS headers; OPTIONS → 404).
  - **Per-user rate limiting**: Vercel overwrites `x-forwarded-for`, so every user shares the
    caller's bucket (for injuries, 30/min total).
  - **Calling previews**, which are behind Vercel Authentication.
- **Would need building:**
  - CORS: an origin allowlist plus `OPTIONS` handling, either in `handler()` / a new `src/lab/cors.ts`
    (shared code), in an Astro `src/middleware.ts` (portfolio-wide), or as header routes injected by
    `vercel-routes.mjs`. `vercel.json` headers probably won't apply (section 1).
  - Caller authentication: an API key or token checked in `handler()`, with the rate limit keyed on
    it instead of the IP.
  - API versioning, so a portfolio deploy can't silently break the other site.
- **Risks:**
  - Two deploys coupled through an unauthenticated, unversioned API.
  - Double function invocations (caller plus portfolio) on the shared Hobby pool.
  - Wildcard-CORS endpoints that call paid APIs would be abusable.
- **Repo rules:** the endpoints still live as a lab project in this repo, under its isolation and
  shared-dep rules. "Graduate" (below) would move them out and end the arrangement.

### (c) Own repo + Vercel project sharing the same Upstash Redis

- **Works today (config only):**
  - A Marketplace resource can be connected to another project: "Connect an existing resource …"
    via `vercel integration resource connect`, or Integrations → Manage → Projects → Connect Project
    ([Marketplace storage](https://vercel.com/docs/marketplace-storage)). That injects the same
    `KV_REST_API_*` vars.
  - The new repo copies `src/lab/api.ts`, `kv.ts` and `rateLimit.ts` (about 180 lines plus tests), or
    uses `@upstash/redis` directly.
- **Would need building:**
  - A key-prefix convention across the two codebases: reuse `lab:<slug>:` to share data with a lab
    project, or a new top-level prefix.
  - Any CORS or auth the new site needs, built natively in its own stack.
- **Risks:**
  - The REST token is database-wide, so there's no isolation between the sites at the Redis level
    **(inferred)**.
  - One Free DB means a shared 500K commands/month and 250 MB, and no budget cap on Free.
  - Key collisions or a `FLUSHDB` in one site hit the other.
  - Hobby non-commercial still applies if the new project is on a Hobby team.
- **What's actually leveraged:** the data store and credentials, not the "server". This is the
  graduation path (`CLAUDE.md:118-119`) with shared data kept.

### (d) Other options the code makes plausible

1. **Custom domain → lab project, on the portfolio project.** Add `newsite.com` to the portfolio
   project, and in `scripts/vercel-routes.mjs` insert a second host route
   (`has: [{type:'host', value:'newsite\\.com'}]`, `dest: '/lab/<slug>/$1'`) before `filesystem`, with
   tests modelled on `scripts/vercel-routes.test.ts`.
   - It keeps all of (a)'s capabilities on a domain of its own.
   - Extra work: `Astro.site` is fixed at isaacdessert.dev (`astro.config.mjs:9`), so canonical, OG
     and sitemap need a per-project origin. `robots.txt`/`favicon.svg`/`sitemap*` passthroughs would
     serve the portfolio's. An SSR page on that host has the same open routing question.
   - Hobby allows 50 domains per project.
   - **(inferred)**: not tried.
2. **Vercel Microfrontends.** The new site is its own project, mounted on a path of isaacdessert.dev
   (or the reverse). Available on Hobby: 2 projects, 50K routed requests/month
   ([Microfrontends](https://vercel.com/docs/microfrontends)). How it would interact with this repo's
   hand-edited `config.json` routes is **unverified**. This is a heavier change.
3. **Proxy rewrites from the new site.** The new project's `vercel.json` rewrites `/api/*` to
   `https://isaacdessert.dev/lab/<slug>/api/*`, so the browser sees one origin and CORS is
   sidestepped.
   - It still has (b)'s IP-collapse problem, and the rate limiter would see the proxy's IP
     (consistent with Vercel overwriting XFF). It still has no auth.
   - **(inferred, unverified)**.
4. **Start as (a), graduate later.** The documented path is: own repo + Vercel project, add
   `<slug>.isaacdessert.dev` there ("explicit domain beats the wildcard"), delete the lab folder
   (`CLAUDE.md:118-119`; spec lines 80-85).
   - The precedence claim isn't stated in the Vercel domain docs I fetched
     ([add a domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain)) **(unverified)**.
   - Redis data under `lab:<slug>:` stays in the shared DB unless the new project connects to it
     (option c).

## 6. Gaps and open questions

| Common production need | Status here | Notes |
|---|---|---|
| Auth / users / sessions | **missing** | No library, no middleware, no session driver (Vercel needs one configured manually) |
| Relational DB / file storage | **missing** | Redis KV only, with a 5-method wrapper; Neon/Blob "documented, not provisioned" |
| CORS | **missing** | OPTIONS → 404; no `Access-Control-*` in code |
| API auth for machine callers | **missing** | Endpoints are public; the IP rate limit is the only control |
| Own domain | **subdomain only** | `<slug>.isaacdessert.dev` works; a custom domain needs a new host rule (d1) |
| Own branding/SEO | **partial** | `LabLayout` forces the portfolio's head and chrome; the escape hatch is a hand-rolled layout |
| SSR pages | **untested** | Supported by the adapter (`_render`), never used for a page; subdomain behaviour unverified |
| Background jobs / cron | **missing** | Only the nightly deploy-hook Action; Hobby crons are daily |
| Monitoring / alerting | **minimal** | `console.error` to runtime logs (1 h on Hobby); no analytics, error tracking or uptime check |
| Budgets / caps | **open TODO** | `CLAUDE.md:177`; Upstash budgets are pay-as-you-go only; Vercel Spend Management is Pro only |
| Release isolation | **missing** | One build and deploy for portfolio + all lab projects; previews lack subdomains |
| Commercial use | **not allowed today** | Team is on Hobby, which is personal/non-commercial |
| Node major pinning | **open TODO** | `engines.node` has no upper bound (`CLAUDE.md:178`) |

## Open questions for the interview

1. **Commercial or personal?** Will the new site earn money, sell, or advertise? If yes, the team
   has to upgrade from Hobby to Pro before launch: the Hobby Terms forbid commercial use. Also
   decide whether commercial use conflicts with the NC-licensed atlas data in the same deployment.
2. **Stay on Hobby or move to Pro?** The team is on Hobby (confirmed 2026-11-18). Pro is required
   for commercial use and is the only tier with Vercel Spend Management; it's $20/seat/month.
3. **Domain:** `<slug>.isaacdessert.dev`, a path on isaacdessert.dev, or its own domain? Is it OK for
   the same pages to also be reachable at `isaacdessert.dev/lab/<slug>/`?
4. **Identity:** should the site visibly belong to the portfolio (nav, footer, " | Isaac Dessert"
   titles, portfolio OG card), or stand alone? This decides `LabLayout` vs a custom layout vs a
   separate repo.
5. **Rendering model:** fully static and rebuilt on deploy or nightly, or does it need per-request
   (SSR) pages? If SSR on a subdomain, are we willing to verify the routing behaviour in production?
6. **Backend surface:** which endpoints, which paid third-party APIs, which secrets, and what
   expected traffic (requests/day)? That feeds the 1M invocations/month and 500K Redis commands/month
   math.
7. **Data:** is KV enough (and which operations beyond get/set/incr/del/expire), or does it need
   Postgres or Blob? Is the data disposable cache or durable user data?
8. **Users and auth:** are there accounts, logins or admin screens? If so, which provider and session
   store? Nothing exists today.
9. **Cross-origin:** will any other origin, browser or server, call this site's APIs, or will it call
   the portfolio's? If so, define a CORS allowlist and an API-key scheme, and say where they live
   (`src/lab/` shared code vs middleware).
10. **Coupling tolerance:** is it acceptable that the site ships with every portfolio deploy and
    shares npm versions, build failures, the Hobby usage pool and one Redis DB? Or should it start
    graduated (own repo and project, optionally sharing Redis)?
11. **Ops bar for "production":** what monitoring, alerting, uptime and log retention are required?
    Should the open TODOs land before launch: the Upstash cap (which may mean moving to
    pay-as-you-go for a budget), a Vercel spend cap (Pro), and the `engines.node` pin?
12. **Preview access:** do reviewers or testers outside Vercel need to see previews? Previews are
    behind Vercel login and have no subdomain routing.
13. **Graduation trigger:** if starting as a lab project, what event moves it out: conflicting deps,
    commercial launch, auth, custom domain, or traffic?

## Sources

**Repo files** (repo-relative):
`CLAUDE.md`, `package.json`, `package-lock.json`, `astro.config.mjs`, `vercel.json`, `tsconfig.json`,
`tailwind.config.mjs`, `.env.example`, `.gitignore`, `public/robots.txt`,
`.github/workflows/nightly-rebuild.yml`,
`scripts/vercel-routes.mjs`, `scripts/vercel-routes.test.ts`, `scripts/lab-isolation.mjs`,
`scripts/lab-isolation.test.ts`, `scripts/new-lab.mjs`, `scripts/unlisted-lab.mjs`, `scripts/check-og.mjs`,
`src/lab/api.ts`, `src/lab/kv.ts`, `src/lab/rateLimit.ts`, `src/lab/meta.ts`, `src/lab/registry.ts`,
`src/lab/url.ts`, `src/lab/slug-rules.mjs`, `src/lab/LabLayout.astro`,
`src/layouts/BaseLayout.astro`, `src/components/Nav.astro`, `src/components/Footer.astro`,
`src/styles/global.css`, `src/lib/og/path.ts`, `src/lib/og/card.ts`, `src/lib/notionLoader.ts`,
`src/data/pageMeta.ts`, `src/pages/og/[...slug].png.ts`, `src/pages/lab/index.astro`, `src/pages/404.astro`,
`src/pages/projects.astro`, `src/pages/lab/injuries/{_meta.ts,index.astro,api/feed.ts,_lib/feed.ts}`,
`src/pages/lab/atlas/{_meta.ts,index.astro}`, `templates/lab/basic/*`, `templates/lab/api/*`,
`docs/superpowers/specs/2026-09-26-lab-platform-design.md`.
Local, gitignored build artifacts (2026-10-06): `.vercel/output/config.json`,
`.vercel/output/functions/_render.func/.vc-config.json`, `.vercel/repo.json`.

**Installed packages** (versions from `package-lock.json`):
- `astro` 7.3.5: `dist/core/app/origin-check.js`, `dist/core/config/schemas/defaults.js`,
  `dist/runtime/server/endpoint.js`, `dist/core/constants.js`, `dist/types/public/config.d.ts`
- `@astrojs/vercel` 11.0.11: `dist/index.js`, `dist/serverless/entrypoint.js`
- `@upstash/ratelimit` 2.2.0: `dist/index.js`
- `@upstash/redis` 1.39.0: `nodejs.js`

**Production observations** (2026-11-18, read-only):
- `dig` for `isaacdessert.dev`, `www.`, `injuries.` and `nope-zz9.` (A records, NS).
- `curl` `GET` of `https://isaacdessert.dev/`, `https://injuries.isaacdessert.dev/` (+ `/robots.txt`)
  and `https://nope-zz9.isaacdessert.dev/`.
- `curl -X OPTIONS https://isaacdessert.dev/lab/injuries/api/feed`.
- `vercel whoami` → logged out.

**Official docs** (fetched 2026-11-18):
- https://vercel.com/legal/terms (§4 Hobby Plan; last updated 2026-10-19)
- https://vercel.com/docs/plans/hobby
- https://vercel.com/docs/limits/fair-use-guidelines
- https://vercel.com/docs/functions/limitations
- https://vercel.com/docs/functions/configuring-functions/duration
- https://vercel.com/docs/headers/request-headers
- https://vercel.com/docs/deployment-protection
- https://vercel.com/docs/spend-management
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://vercel.com/docs/logs/runtime
- https://vercel.com/docs/microfrontends
- https://vercel.com/docs/domains/working-with-domains/add-a-domain
- https://vercel.com/docs/marketplace-storage
- https://vercel.com/docs/redis
- https://vercel.com/docs/build-output-api/configuration
- https://vercel.com/kb/guide/how-to-enable-cors
- https://upstash.com/pricing/redis (redirect target of https://upstash.com/docs/redis/overall/pricing)
- https://docs.astro.build/en/guides/sessions/
