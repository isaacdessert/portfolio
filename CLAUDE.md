# Portfolio Site — Claude Context

Personal portfolio site for Isaac Dessert (Lead Software Engineer).
Built with Astro + Tailwind CSS, hosted on GitHub Pages.

## Local Development

```bash
npm install
npm run dev       # http://localhost:4321/portfolio/
npm run build     # production build to dist/
```

## Deployment

Push to `main` → GitHub Actions builds and deploys automatically to:
`https://isaacdessert.github.io/portfolio`

Workflow file: `.github/workflows/deploy.yml`

## Tech Stack

- **Framework**: Astro 5 (static output)
- **Styling**: Tailwind CSS v3 + `@tailwindcss/typography`
- **Blog**: Astro Content Collections (Markdown)
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

- `astro.config.mjs` — site URL, base path (`/portfolio`), integrations
- `tailwind.config.mjs` — color tokens, typography plugin config
- `tsconfig.json` — TypeScript config with `@/*` path alias for `src/`

## Blog Posts

Add a file to `src/content/blog/your-title.md`:

```markdown
---
title: "Post Title"
date: 2026-03-28
tags: [engineering, thoughts]
excerpt: "One sentence shown on the blog index card."
draft: false   # set true to write without publishing
---

Content here...
```

Filename becomes the URL slug. Push to `main` to publish.

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

## Re-enabling Blog & Reading

Both pages exist and work — they are just hidden from navigation.
To re-enable:

1. **`src/components/Nav.astro`** — uncomment the two lines:
   ```ts
   { label: 'Blog', href: '/portfolio/blog' },
   { label: 'Reading', href: '/portfolio/reading' },
   ```

2. **`src/pages/index.astro`** — uncomment the two CTA buttons:
   ```astro
   <a href="/portfolio/blog" class="btn-secondary">Read Blog</a>
   <a href="/portfolio/reading" class="btn-secondary">Reading List</a>
   ```

3. **`src/components/Terminal.astro`** — restore the `blog` command
   and add `blog` / `reading` back to the `open` routes and `help` list.

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

All internal links use the `/portfolio/` prefix — a global find/replace
would be needed if the base path changes.
