import { z } from 'astro/zod';
import { handler, json, readBody } from '@lab/api';
import { rateLimit } from '@lab/rateLimit';

// Project-specific secrets: name them __ENV_PREFIX___* in Vercel and read them with requireEnv().
export const prerender = false;

export const POST = handler(async ({ request }) => {
  await rateLimit(request, { slug: '__SLUG__', id: 'example', limit: 20, window: '1 m' });
  const { message } = await readBody(request, z.object({ message: z.string().min(1).max(500) }));
  return json({ echo: message });
});
