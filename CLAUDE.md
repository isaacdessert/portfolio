# Portfolio Site — Claude Context

Personal portfolio site for Isaac Dessert (Lead Software Engineer).
Built with Astro + Tailwind CSS, hosted on Vercel.

## Local Development

```bash
npm install
npm run dev       # http://localhost:4321/portfolio/
npm run build     # production build to dist/
```

## Deployment

Push to `main` → Vercel auto-deploys to:
`https://isaac-dessert-portfolio.vercel.app`

## Tech Stack

- **Framework**: Astro 5 (static output)
- **Styling**: Tailwind CSS v3 + `@tailwindcss/typography`
- **Blog**: Notion CMS via Astro 5 Content Layer
- **Projects**: GitHub REST API fetched at build time (no token — public API only)
- **Hosting**: GitHub Pages via GitHub Actions

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
│   └── BlogCard.astro      # Blog post preview card
├── content/
│   └── blog/               # Markdown blog posts (.md files)
├── data/
│   ├── featured.ts         # Repo names to pin on projects page
│   └── books.ts            # Reading list data
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
│   └── reading.astro       # Reading list
└── styles/
    └── global.css          # Base styles, shared component classes
```

## Key Config Files

- `astro.config.mjs` — site URL, base path (`/`), integrations
- `tailwind.config.mjs` — color tokens, typography plugin config
- `tsconfig.json` — TypeScript config with `@/*` path alias for `src/`

## Blog Posts

Posts are managed in Notion. Publishing workflow:

1. Open your Notion blog database
2. Create a new page — fill in Name, Date, Tags, Excerpt, and body content
3. Set **Status** to `Published` (must be a **Select** field type, not the native Status type)
4. The site rebuilds nightly at midnight US Central (6am UTC) automatically
5. For immediate publish: go to GitHub → Actions → "Deploy to GitHub Pages" → Run workflow

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

- **Blog** — live. Posts in `src/content/blog/`, linked in nav, homepage CTA, and terminal.
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

The site is hosted at `/portfolio/` (not root). If the repo is ever renamed
or moved to `isaacdessert.github.io`, update `base` in `astro.config.mjs`:

```js
base: '/',   // for isaacdessert.github.io root repo
```

All internal links use root-relative paths (`/about`, `/projects`, etc.) for Vercel deployment.
