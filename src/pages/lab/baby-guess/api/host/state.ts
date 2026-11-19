import { handler } from '@lab/api';
import { readHost } from '../../_lib/actions';
import { deps, guardHost, noStore } from '../../_lib/server';

export const prerender = false;

export const GET = handler(async ({ request }) => {
  await guardHost(request);
  return noStore(await readHost(deps()));
});
