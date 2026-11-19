import { handler } from '@lab/api';
import { rateLimit } from '@lab/rateLimit';
import { readPublic } from '../_lib/actions';
import { deps, noStore, SLUG } from '../_lib/server';

export const prerender = false;

export const GET = handler(async ({ request }) => {
  await rateLimit(request, { slug: SLUG, id: 'state', limit: 60, window: '1 m' });
  return noStore(await readPublic(deps()));
});
