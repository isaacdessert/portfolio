import { readBody } from '@lab/api';
import { revealAnswer } from '../../_lib/actions';
import { revealSchema } from '../../_lib/schemas';
import { deps, guardHost, noStore, route } from '../../_lib/server';

export const prerender = false;

export const POST = route(async ({ request }) => {
  await guardHost(request);
  const input = await readBody(request, revealSchema);
  await revealAnswer(deps(), input);
  return noStore({ ok: true });
});
