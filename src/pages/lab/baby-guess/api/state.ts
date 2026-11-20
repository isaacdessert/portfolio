import { rateLimit } from '@lab/rateLimit';
import { readPublic } from '../_lib/actions';
import { deps, noStore, route, SLUG } from '../_lib/server';

export const prerender = false;

export const GET = route(async ({ request }) => {
  await rateLimit(request, { slug: SLUG, id: 'state', limit: 60, window: '1 m' });
  return noStore(await readPublic(deps()));
});
