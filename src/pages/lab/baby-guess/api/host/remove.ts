import { readBody } from '@lab/api';
import { removeEntry } from '../../_lib/actions';
import { removeSchema } from '../../_lib/schemas';
import { deps, guardHost, noStore, route } from '../../_lib/server';

export const prerender = false;

export const POST = route(async ({ request }) => {
  await guardHost(request);
  const input = await readBody(request, removeSchema);
  await removeEntry(deps(), input);
  return noStore({ ok: true });
});
