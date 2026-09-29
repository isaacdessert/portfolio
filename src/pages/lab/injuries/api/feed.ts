import { handler, json } from '@lab/api';
import { kv } from '@lab/kv';
import { rateLimit } from '@lab/rateLimit';
import { getFeed, fetchEspnJson } from '../_lib/feed';

export const prerender = false;

const store = kv('injuries');

export const GET = handler(async ({ request }) => {
  await rateLimit(request, { slug: 'injuries', id: 'feed', limit: 30, window: '1 m' });
  const feed = await getFeed({ store, fetchEspn: fetchEspnJson, now: () => new Date() });
  return json(feed, { headers: { 'cache-control': 'no-store' } });
});
