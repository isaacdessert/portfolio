import { handler, readBody } from '@lab/api';
import { revealAnswer } from '../../_lib/actions';
import { revealSchema } from '../../_lib/schemas';
import { deps, guardHost, noStore } from '../../_lib/server';

export const prerender = false;

export const POST = handler(async ({ request }) => {
  await guardHost(request);
  const input = await readBody(request, revealSchema);
  await revealAnswer(deps(), input);
  return noStore({ ok: true });
});
