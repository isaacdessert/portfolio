import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { notionLoader } from './lib/notionLoader';

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
