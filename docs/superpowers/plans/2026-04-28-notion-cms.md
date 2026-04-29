# Notion CMS Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `.md` file-based blog posts with a Notion database as the content source, fetched at build time via a custom Astro 5 Content Layer loader, with nightly automated deploys via GitHub Actions.

**Architecture:** A custom `notionLoader()` reads from a Notion database (filtering for `Status = Published`), converts Notion blocks to Markdown using `notion-to-md`, pre-renders to HTML with `marked`, and stores entries in the Astro Content Layer. The existing `getCollection('blog')` calls in `blog/index.astro` and `blog/[...slug].astro` work with minimal changes (only `post.slug` → `post.id` and `post.render()` → `render(post)`). Nightly deploys are triggered by adding a `schedule` cron to the existing `deploy.yml` GitHub Actions workflow, which already handles build + GitHub Pages deploy.

**Tech Stack:** Astro 5 Content Layer API, `@notionhq/client`, `notion-to-md`, `marked`, `vitest`, GitHub Actions

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/lib/notionLoader.ts` | Create | Custom Astro 5 Content Layer loader that fetches from Notion |
| `src/lib/slug.ts` | Create | `toSlug(title)` helper — testable utility |
| `src/lib/slug.test.ts` | Create | Vitest unit tests for `toSlug` |
| `src/content/config.ts` | Modify | Switch `blog` collection from `type: 'content'` to `loader: notionLoader()` |
| `src/pages/blog/[...slug].astro` | Modify | `post.slug` → `post.id`, `post.render()` → `render(post)` |
| `src/pages/blog/index.astro` | Modify | `post.slug` → `post.id` |
| `.github/workflows/deploy.yml` | Modify | Add `schedule` cron trigger + pass Notion secrets to build step |
| `.env` | Create | Local dev env vars (gitignored — never commit) |
| `.gitignore` | Modify | Ensure `.env` is listed |
| `package.json` | Modify | Add `@notionhq/client`, `notion-to-md`, `marked`, `vitest` |
| `CLAUDE.md` | Modify | Update blog workflow docs to reflect Notion-based publishing |

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install packages**

```bash
cd /Users/isaac/git/portfolio
npm install @notionhq/client notion-to-md marked
npm install --save-dev vitest @vitest/coverage-v8
```

- [ ] **Step 2: Add vitest config to package.json**

Open `package.json`. Add `"test": "vitest run"` to the `scripts` block so it reads:

```json
{
  "name": "portfolio",
  "type": "module",
  "version": "0.0.1",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "astro": "astro",
    "test": "vitest run"
  },
  ...
}
```

- [ ] **Step 3: Verify install**

```bash
npm run test
```

Expected: `No test files found, exiting with code 0` (no tests yet — that's fine)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add notion-to-md, @notionhq/client, marked, vitest"
```

---

## Task 2: Slug utility (TDD)

**Files:**
- Create: `src/lib/slug.ts`
- Create: `src/lib/slug.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/slug.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toSlug } from './slug';

describe('toSlug', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(toSlug('Hello World')).toBe('hello-world');
  });

  it('strips non-alphanumeric characters except hyphens', () => {
    expect(toSlug('My Post: A Story!')).toBe('my-post-a-story');
  });

  it('collapses multiple spaces into one hyphen', () => {
    expect(toSlug('Too   Many   Spaces')).toBe('too-many-spaces');
  });

  it('trims leading and trailing whitespace', () => {
    expect(toSlug('  padded  ')).toBe('padded');
  });

  it('handles hyphens already in the title', () => {
    expect(toSlug('Well-Known Pattern')).toBe('well-known-pattern');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test
```

Expected: `Cannot find module './slug'` — confirms tests are wired up

- [ ] **Step 3: Implement the utility**

Create `src/lib/slug.ts`:

```ts
export function toSlug(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-');
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test
```

Expected: `5 tests passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/slug.ts src/lib/slug.test.ts
git commit -m "feat: add toSlug utility with tests"
```

---

## Task 3: Notion loader

**Files:**
- Create: `src/lib/notionLoader.ts`

The loader runs at build time on the server. It uses `process.env` (not `import.meta.env`) because the Content Layer runs in a Node.js context before Astro's env processing.

- [ ] **Step 1: Create the loader**

Create `src/lib/notionLoader.ts`:

```ts
import { Client, isFullPage } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import { marked } from 'marked';
import { toSlug } from './slug';
import type { Loader } from 'astro/loaders';

export function notionLoader(): Loader {
  return {
    name: 'notion-loader',
    async load({ store, logger }) {
      const token = process.env.NOTION_TOKEN;
      const databaseId = process.env.NOTION_DATABASE_ID;

      if (!token || !databaseId) {
        logger.warn('NOTION_TOKEN or NOTION_DATABASE_ID not set — skipping Notion fetch');
        return;
      }

      const notion = new Client({ auth: token });
      const n2m = new NotionToMarkdown({ notionClient: notion });

      const response = await notion.databases.query({
        database_id: databaseId,
        filter: {
          property: 'Status',
          select: { equals: 'Published' },
        },
      });

      store.clear();

      for (const page of response.results) {
        if (!isFullPage(page)) continue;

        const nameProp = page.properties['Name'];
        const title =
          nameProp?.type === 'title' ? (nameProp.title[0]?.plain_text ?? 'Untitled') : 'Untitled';

        const dateProp = page.properties['Date'];
        const dateStr =
          dateProp?.type === 'date' && dateProp.date?.start
            ? dateProp.date.start
            : new Date().toISOString().split('T')[0];

        const tagsProp = page.properties['Tags'];
        const tags =
          tagsProp?.type === 'multi_select' ? tagsProp.multi_select.map((t) => t.name) : [];

        const excerptProp = page.properties['Excerpt'];
        const excerpt =
          excerptProp?.type === 'rich_text'
            ? (excerptProp.rich_text[0]?.plain_text ?? '')
            : '';

        const slug = toSlug(title);

        const mdBlocks = await n2m.pageToMarkdown(page.id);
        const { parent: body } = n2m.toMarkdownString(mdBlocks);

        const html = await marked(body);

        store.set({
          id: slug,
          data: {
            title,
            date: new Date(dateStr),
            tags,
            excerpt,
            draft: false,
          },
          body,
          rendered: {
            html,
            metadata: { headings: [], imagePaths: [] },
          },
        });
      }

      logger.info(`Loaded ${response.results.length} posts from Notion`);
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/notionLoader.ts
git commit -m "feat: add Notion Content Layer loader"
```

---

## Task 4: Wire up the Content Layer in config

**Files:**
- Modify: `src/content/config.ts`

- [ ] **Step 1: Update the collection to use the loader**

Replace the entire contents of `src/content/config.ts` with:

```ts
import { defineCollection, z } from 'astro:content';
import { notionLoader } from '../lib/notionLoader';

const blog = defineCollection({
  loader: notionLoader(),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    excerpt: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
```

Note: `z.coerce.date()` (not `z.date()`) handles the `Date` objects passed from the loader.

- [ ] **Step 2: Commit**

```bash
git add src/content/config.ts
git commit -m "feat: switch blog collection to Notion loader"
```

---

## Task 5: Update blog pages for Content Layer API

**Files:**
- Modify: `src/pages/blog/[...slug].astro`
- Modify: `src/pages/blog/index.astro`

In Astro 5 Content Layer, `post.slug` becomes `post.id`, and `post.render()` becomes `render(post)` (imported from `astro:content`).

- [ ] **Step 1: Update `[...slug].astro`**

Replace the entire contents of `src/pages/blog/[...slug].astro` with:

```astro
---
import { getCollection, render } from 'astro:content';
import BlogLayout from '@/layouts/BlogLayout.astro';

export async function getStaticPaths() {
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  return posts.map(post => ({
    params: { slug: post.id },
    props: { post },
  }));
}

const { post } = Astro.props;
const { Content } = await render(post);

function estimateReadTime(body: string): number {
  const words = body.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}
---

<BlogLayout
  title={post.data.title}
  date={post.data.date}
  tags={post.data.tags}
  excerpt={post.data.excerpt}
  readTime={estimateReadTime(post.body ?? '')}
>
  <Content />
</BlogLayout>
```

- [ ] **Step 2: Update `blog/index.astro`**

Change line 8 in `src/pages/blog/index.astro` — the `BlogCard` slug prop — from `post.slug` to `post.id`:

```astro
        {allPosts.map(post => (
          <BlogCard
            title={post.data.title}
            date={post.data.date}
            tags={post.data.tags}
            excerpt={post.data.excerpt}
            slug={post.id}
            readTime={estimateReadTime(post.body ?? '')}
          />
        ))}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/blog/[...slug].astro src/pages/blog/index.astro
git commit -m "feat: update blog pages for Content Layer API (post.id, render())"
```

---

## Task 6: Set up local env and verify the build

**Files:**
- Create: `.env`
- Modify: `.gitignore`

- [ ] **Step 1: Ensure `.env` is gitignored**

Check `.gitignore`. If `.env` is not listed, add it:

```
.env
```

- [ ] **Step 2: Create local `.env` file**

Create `.env` in the project root (never commit this):

```
NOTION_TOKEN=secret_your_integration_token_here
NOTION_DATABASE_ID=your_database_id_here
```

You'll fill these in after setting up the Notion integration (see Notion Setup section below).

- [ ] **Step 3: Run the dev build to verify**

```bash
npm run build
```

With real values filled in: Expected output ends with `✓ Built in Xs` and blog posts appear under `dist/blog/`.

With placeholder values: Expected: build succeeds, loader logs `NOTION_TOKEN or NOTION_DATABASE_ID not set — skipping Notion fetch`, blog index shows "No posts yet."

- [ ] **Step 4: Commit .gitignore change only**

```bash
git add .gitignore
git commit -m "chore: ensure .env is gitignored"
```

---

## Task 7: Add nightly deploy to GitHub Actions

**Files:**
- Modify: `.github/workflows/deploy.yml`

The existing workflow builds and deploys to GitHub Pages on every push to `main`. We need to:
1. Add a `schedule` trigger for nightly runs
2. Pass `NOTION_TOKEN` and `NOTION_DATABASE_ID` from GitHub Secrets to the build step

- [ ] **Step 1: Update `deploy.yml`**

Replace the `on:` block and add env vars to the Build step. Full updated file:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 6 * * *'   # 6am UTC = midnight US Central
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    name: Build
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build
        env:
          NOTION_TOKEN: ${{ secrets.NOTION_TOKEN }}
          NOTION_DATABASE_ID: ${{ secrets.NOTION_DATABASE_ID }}

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist/

  deploy:
    name: Deploy
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "feat: add nightly Notion rebuild via GitHub Actions cron"
```

---

## Task 8: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Blog Posts section in CLAUDE.md**

Find the `## Blog Posts` section and replace it with:

```markdown
## Blog Posts

Posts are managed in Notion. Publishing workflow:

1. Open your Notion blog database
2. Create a new page — fill in Name, Date, Tags, Excerpt, and body content
3. Set **Status** to `Published`
4. The site rebuilds nightly at midnight US Central (6am UTC) automatically
5. For immediate publish: go to GitHub → Actions → "Deploy to GitHub Pages" → Run workflow

**Notion database fields:**
| Field | Type | Notes |
|---|---|---|
| Name | Title | Post title → URL slug |
| Date | Date | Publish date |
| Tags | Multi-select | e.g. engineering, leadership |
| Excerpt | Rich text | One-liner shown on blog index card |
| Status | Select | `Published` or `Draft` |
| (page body) | Notion blocks | Full post content |

**Local dev with Notion:**
Copy `.env.example` to `.env` and fill in:
- `NOTION_TOKEN` — from your Notion integration settings
- `NOTION_DATABASE_ID` — from the database URL

If these are not set, the build skips Notion and shows "No posts yet."
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for Notion-based blog workflow"
```

---

## Notion Setup (Manual Steps — Do These Before Running the Build)

These steps happen in Notion and GitHub, not in code:

1. **Create a Notion integration** at https://www.notion.so/my-integrations
   - Name it `Portfolio Blog`
   - Copy the **Internal Integration Secret** → this is `NOTION_TOKEN`

2. **Create the Notion database** with these fields:
   - `Name` (Title — already exists by default)
   - `Date` (Date type)
   - `Tags` (Multi-select type)
   - `Excerpt` (Text type)
   - `Status` (Select type — add options: `Published`, `Draft`)

3. **Share the database with your integration**:
   - Open the database → top-right `...` menu → Add connections → select `Portfolio Blog`

4. **Get the Database ID**:
   - Open the database in browser
   - URL format: `https://www.notion.so/{workspace}/{DATABASE_ID}?v=...`
   - Copy the 32-character ID → this is `NOTION_DATABASE_ID`

5. **Add GitHub Actions secrets**:
   - Go to your GitHub repo → Settings → Secrets and variables → Actions → New repository secret
   - Add `NOTION_TOKEN` and `NOTION_DATABASE_ID`

6. **Fill in `.env`** for local development with the same values

---

## Self-Review Notes

- Spec says "Status = Published" filter → Task 3 loader implements exactly this
- Spec says `toSlug` derives slug from title → Task 2 implements and tests this
- Spec says `getCollection('blog')` stays unchanged → Tasks 4+5 preserve the call, only updating `post.id`/`render(post)`
- Spec says nightly at midnight US Central → Task 7 uses `0 6 * * *` (6am UTC)
- Spec says manual trigger → `workflow_dispatch` was already in `deploy.yml`, preserved in Task 7
- Env vars: `NOTION_TOKEN` and `NOTION_DATABASE_ID` only — no Vercel deploy hook needed since we use GitHub Actions + GitHub Pages
- Graceful degradation: loader warns and returns early if env vars are missing (Task 3, Step 1)
