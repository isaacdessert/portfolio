import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { notionLoader } from './lib/notionLoader';
import { notionBooksLoader } from './lib/notionBooksLoader';

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

const books = defineCollection({
  loader: notionBooksLoader(),
  schema: z.object({
    title: z.string(),
    author: z.string(),
    status: z.enum(['reading', 'read', 'want']),
    year: z.number().optional(),
    take: z.string().optional(),
    url: z.string().optional(),
  }),
});

export const collections = { blog, books };
