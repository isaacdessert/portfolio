# Blog Post — Design Spec

**Date:** 2026-04-28  
**Topic:** Adding first real blog post and enabling the blog section

## What We're Doing

Adding Isaac's first published blog post and enabling the blog in the site navigation.

## Changes

### 1. Remove hello-world post
Delete `src/content/blog/hello-world.md` — it was a placeholder, not intended for publication.

### 2. Create new blog post
**File:** `src/content/blog/using-deterministic-output-to-squeeze-value-out-of-ai.md`

**Frontmatter:**
- Title: "Using deterministic output to squeeze value out of AI"
- Date: 2026-04-28
- Tags: [ai, engineering, product]
- Excerpt: "Why AI thrives in software engineering but struggles elsewhere — and how deterministic output is the key to changing that."
- Draft: false

**Content:** Isaac's post verbatim, formatted with Markdown headings.

### 3. Enable blog in navigation
Per CLAUDE.md instructions, uncomment blog links in three files:
- `src/components/Nav.astro` — Blog nav link
- `src/pages/index.astro` — "Read Blog" CTA button
- `src/components/Terminal.astro` — `blog` command and routes

## Success Criteria
- Blog post appears at `/blog/using-deterministic-output-to-squeeze-value-out-of-ai`
- Blog index at `/blog` shows the post
- Nav has a "Blog" link
- Hello world post is gone
