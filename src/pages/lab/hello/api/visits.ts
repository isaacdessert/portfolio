import { handler, json } from '@lab/api';
import { kv } from '@lab/kv';
import { rateLimit } from '@lab/rateLimit';

export const prerender = false;

const store = kv('hello');

export const GET = handler(async () => {
  return json({ visits: (await store.get<number>('visits')) ?? 0 });
});

export const POST = handler(async ({ request }) => {
  await rateLimit(request, { slug: 'hello', id: 'visit', limit: 10, window: '1 m' });
  return json({ visits: await store.incr('visits') });
});
