import { readBody } from '@lab/api';
import { addDecoy } from '../../_lib/actions';
import { decoySchema } from '../../_lib/schemas';
import { deps, guardHost, noStore, route } from '../../_lib/server';

export const prerender = false;

export const POST = route(async ({ request }) => {
  await guardHost(request);
  const input = await readBody(request, decoySchema);
  await addDecoy(deps(), input);
  return noStore({ ok: true });
});
