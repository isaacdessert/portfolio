// Deletes one key space's game data (guesses, decoys, game) from the shared Upstash Redis DB.
// For rehearsing on `preview`/`development` only — refuses `production` outright. See
// docs/superpowers/specs/2026-11-18-baby-guess-design.md §5.
// Run: node --env-file=.env src/pages/lab/baby-guess/_scripts/reset.mjs <keySpace>

import { Redis } from '@upstash/redis';

const [keySpace] = process.argv.slice(2);

if (!keySpace) {
  console.error('Usage: node src/pages/lab/baby-guess/_scripts/reset.mjs <keySpace>');
  process.exit(1);
}

if (keySpace === 'production') {
  console.error('Refusing to reset production.');
  process.exit(1);
}

const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });

const prefix = `lab:baby-guess:${keySpace}:`;
const removed = await redis.del(`${prefix}guesses`, `${prefix}decoys`, `${prefix}game`);
console.log(`Removed ${removed} keys`);
