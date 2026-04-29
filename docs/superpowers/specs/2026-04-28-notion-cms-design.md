# Notion CMS Integration — Design Spec

**Date:** 2026-04-28
**Status:** Approved

## Goal

Replace the current file-based blog (`.md` files in `src/content/blog/`) with a Notion database as the content source. Blog posts are written and managed in Notion; the site fetches them at build time. No PRs required to publish.

---

## Architecture

```
Notion DB (Status = Published)
        ↓  Notion API + notion-to-md  (at build time)
src/lib/notionLoader.ts
        ↓  Astro 5 Content Layer
getCollection('blog')
        ↓
blog/index.astro + blog/[...slug].astro  (unchanged)

GitHub Actions cron (6am UTC / midnight US Central)
        → POST to Vercel deploy hook
        → Vercel triggers astro build
        → loader fetches fresh Notion content
```

`output: 'static'` stays unchanged. No Vercel adapter needed.

---

## Notion Database Schema

| Field | Notion Type | Notes |
|---|---|---|
| Name | Title | Post title; becomes the URL slug |
| Date | Date | Publish date |
| Tags | Multi-select | e.g. `engineering`, `leadership` |
| Excerpt | Rich text | One-liner shown on blog index card |
| Status | Select | `Published` or `Draft` — only `Published` is fetched |
| (page body) | Notion blocks | Full post content, converted to Markdown at build time |

---

## New Files

### `src/lib/notionLoader.ts`

Custom Astro 5 Content Layer loader. At build time:

1. Calls `notion.databases.query()` filtering for `Status = Published`
2. For each result, fetches block content via `notion-to-md` → Markdown string
3. Returns entries matching the existing blog collection schema:
   - `id`: Notion page ID (used as slug)
   - `data.title`, `data.date`, `data.tags`, `data.excerpt`, `data.draft: false`
   - `body`: Markdown string

The slug is derived from the page title (lowercased, spaces → hyphens).

### `.github/workflows/nightly-deploy.yml`

GitHub Actions workflow:

```yaml
on:
  schedule:
    - cron: '0 6 * * *'   # 6am UTC = midnight US Central
  workflow_dispatch:        # allows manual trigger from GitHub Actions UI
```

Single step: `curl -X POST ${{ secrets.VERCEL_DEPLOY_HOOK_URL }}`

---

## Changed Files

### `src/content/config.ts`

Switch the `blog` collection from the default file loader to `notionLoader()`. The collection schema stays identical — `blog/index.astro` and `blog/[...slug].astro` require no changes.

### `package.json`

Add two dependencies:
- `@notionhq/client` — official Notion SDK
- `notion-to-md` — converts Notion block tree to Markdown

---

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `NOTION_TOKEN` | Vercel project settings + `.env` | Notion integration secret |
| `NOTION_DATABASE_ID` | Vercel project settings + `.env` | ID of the blog database |
| `VERCEL_DEPLOY_HOOK_URL` | GitHub Actions secret only | URL to POST to trigger a rebuild |

`NOTION_TOKEN` and `NOTION_DATABASE_ID` are used by the Astro build (loader runs at build time). `VERCEL_DEPLOY_HOOK_URL` is never in the Astro app — it's only in GitHub Actions.

---

## Manual Deploy Options

- **Vercel dashboard** → Deployments → Redeploy (no setup needed)
- **Terminal**: `curl -X POST $VERCEL_DEPLOY_HOOK_URL`
- **GitHub Actions UI**: workflow has `workflow_dispatch` so you can trigger it manually from the GitHub Actions tab

---

## Files Removed

- `src/content/blog/*.md` — replaced by Notion as the source of truth

---

## Out of Scope

- Real-time webhook rebuild (replaced by nightly cron + manual)
- Preview/draft mode in the browser
- Rich Notion embeds (images, callouts, etc.) — basic Markdown conversion only for now
