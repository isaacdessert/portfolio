import { handler, readBody } from '@lab/api';
import { addDecoy } from '../../_lib/actions';
import { decoySchema } from '../../_lib/schemas';
import { deps, guardHost, noStore } from '../../_lib/server';

export const prerender = false;

export const POST = handler(async ({ request }) => {
  await guardHost(request);
  const input = await readBody(request, decoySchema);
  await addDecoy(deps(), input);
  return noStore({ ok: true });
});
