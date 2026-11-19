import { handler, readBody } from '@lab/api';
import { lockBoards } from '../../_lib/actions';
import { lockSchema } from '../../_lib/schemas';
import { deps, guardHost, noStore } from '../../_lib/server';

export const prerender = false;

export const POST = handler(async ({ request }) => {
  await guardHost(request);
  const input = await readBody(request, lockSchema);
  await lockBoards(deps(), input);
  return noStore({ ok: true });
});
