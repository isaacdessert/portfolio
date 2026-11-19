import { handler, readBody } from '@lab/api';
import { rateLimit } from '@lab/rateLimit';
import { submitGuess } from '../_lib/actions';
import { guessSchema } from '../_lib/schemas';
import { deps, noStore, SLUG } from '../_lib/server';

export const prerender = false;

export const POST = handler(async ({ request }) => {
  await rateLimit(request, { slug: SLUG, id: 'guess', limit: 20, window: '10 m' });
  const input = await readBody(request, guessSchema);
  const guess = await submitGuess(deps(), input);
  return noStore({ guess }, 201);
});
