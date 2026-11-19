import { readBody } from '@lab/api';
import { saveConfig } from '../../_lib/actions';
import { configSchema } from '../../_lib/schemas';
import { deps, guardHost, noStore, route } from '../../_lib/server';

export const prerender = false;

export const POST = route(async ({ request }) => {
  await guardHost(request);
  const input = await readBody(request, configSchema);
  await saveConfig(deps(), input);
  return noStore({ ok: true });
});
