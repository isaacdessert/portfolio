import { readHost } from '../../_lib/actions';
import { deps, guardHost, noStore, route } from '../../_lib/server';

export const prerender = false;

export const GET = route(async ({ request }) => {
  await guardHost(request);
  return noStore(await readHost(deps()));
});
