// Second sanctioned reader of @lab/* from portfolio code (see scripts/lab-isolation.mjs):
// og card metadata (title/description/tags) is read-only project metadata, same as the
// /lab index page.
import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { renderCard, type CardInput } from '@/lib/og/card';
import { pageMeta } from '@/data/pageMeta';
import { estimateReadTime } from '@/lib/readTime';
import { projects } from '@lab/registry';

export const prerender = true;

export const getStaticPaths: GetStaticPaths = async () => {
  const pagePaths = Object.entries(pageMeta).map(([slug, meta]) => ({
    params: { slug },
    props: {
      eyebrow: `isaacdessert.dev/${slug}`,
      title: meta.title,
      description: meta.description,
    } satisfies CardInput,
  }));

  const posts = await getCollection('blog', ({ data }) => !data.draft);
  const blogPaths = posts.map((post) => {
    const slug = `blog/${post.id}`;
    const formattedDate = post.data.date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return {
      params: { slug },
      props: {
        eyebrow: `isaacdessert.dev/${slug}`,
        title: post.data.title,
        description: post.data.excerpt,
        footer: `${formattedDate} · ${estimateReadTime(post.body ?? '')} min read`,
      } satisfies CardInput,
    };
  });

  const labPaths = projects.map((project) => {
    const slug = `lab/${project.slug}`;
    return {
      params: { slug },
      props: {
        eyebrow: `isaacdessert.dev/${slug}`,
        title: project.title,
        description: project.description,
        footer: project.tags.map((tag) => `#${tag}`).join(' '),
      } satisfies CardInput,
    };
  });

  return [...pagePaths, ...blogPaths, ...labPaths];
};

export const GET: APIRoute = async ({ props }) => {
  const png = await renderCard(props as CardInput);
  return new Response(png, { headers: { 'content-type': 'image/png' } });
};
