// `npm run dev:local`: the dev server against an in-memory stand-in for Upstash Redis, so lab
// projects run locally without real KV credentials (the pulled .env often has them as
// [SENSITIVE]). It speaks the slice of Upstash's REST protocol the lab uses: get/set/incr/del/
// expire, hashes, pipelines, and the @upstash/ratelimit sliding-window script. Data lives in
// memory and is gone when this process stops.
import http from 'node:http';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

class CommandError extends Error {}

/** In-memory keyspace. Entries are strings or hashes (Map), with an optional expiry in ms. */
export function createStore(now = () => Date.now()) {
  /** @type {Map<string, { value: string | Map<string, string>, expiresAt?: number }>} */
  const data = new Map();

  const live = (key) => {
    const entry = data.get(key);
    if (entry?.expiresAt !== undefined && entry.expiresAt <= now()) {
      data.delete(key);
      return undefined;
    }
    return entry;
  };
  const stringAt = (key) => {
    const entry = live(key);
    if (entry && typeof entry.value !== 'string') throw new CommandError('WRONGTYPE Operation against a key holding the wrong kind of value');
    return entry;
  };
  const hashAt = (key, create = false) => {
    let entry = live(key);
    if (entry && typeof entry.value === 'string') throw new CommandError('WRONGTYPE Operation against a key holding the wrong kind of value');
    if (!entry && create) {
      entry = { value: new Map() };
      data.set(key, entry);
    }
    return /** @type {Map<string, string> | undefined} */ (entry?.value);
  };
  const expireIn = (key, ms) => {
    const entry = live(key);
    if (!entry) return 0;
    entry.expiresAt = now() + ms;
    return 1;
  };
  const incrBy = (key, by) => {
    const entry = stringAt(key);
    const next = Number(entry?.value ?? 0) + by;
    if (!Number.isInteger(next)) throw new CommandError('ERR value is not an integer or out of range');
    data.set(key, { value: String(next), expiresAt: entry?.expiresAt });
    return next;
  };

  // Mirrors @upstash/ratelimit's single-region slidingWindow limit script:
  // KEYS = [current window, previous window], ARGV = [tokens, now ms, window ms, incrementBy].
  const slidingWindow = (keys, args) => {
    if (keys.length !== 2 || args.length !== 4) {
      throw new CommandError('ERR the dev-kv stub only emulates the sliding-window rate limit script');
    }
    const [currentKey, previousKey] = keys;
    const [tokens, nowMs, windowMs, incrementBy] = args.map(Number);
    const current = Number(stringAt(currentKey)?.value ?? 0);
    const previous = Number(stringAt(previousKey)?.value ?? 0);
    const weightedPrevious = Math.floor((1 - (nowMs % windowMs) / windowMs) * previous);
    if (incrementBy > 0 && weightedPrevious + current >= tokens) return [-1, tokens];
    const newValue = incrBy(currentKey, incrementBy);
    if (newValue === incrementBy) expireIn(currentKey, windowMs * 2 + 1000);
    return [tokens - (newValue + weightedPrevious), tokens];
  };

  /** Runs one command (`["set", "k", "v", "ex", 60]`) and returns its Redis reply. */
  function exec(command) {
    if (!Array.isArray(command) || command.length === 0) throw new CommandError('ERR empty command');
    const [rawName, ...rest] = command;
    const name = String(rawName).toLowerCase();
    const args = rest.map((a) => (typeof a === 'string' ? a : JSON.stringify(a)));

    switch (name) {
      case 'ping':
        return 'PONG';
      case 'get':
        return stringAt(args[0])?.value ?? null;
      case 'set': {
        const [key, value, ...options] = args;
        let expiresAt;
        let mode;
        let keepTtl = false;
        for (let i = 0; i < options.length; i++) {
          const option = options[i].toLowerCase();
          if (option === 'ex') expiresAt = now() + Number(options[++i]) * 1000;
          else if (option === 'px') expiresAt = now() + Number(options[++i]);
          else if (option === 'exat') expiresAt = Number(options[++i]) * 1000;
          else if (option === 'pxat') expiresAt = Number(options[++i]);
          else if (option === 'nx' || option === 'xx') mode = option;
          else if (option === 'keepttl') keepTtl = true;
          else throw new CommandError(`ERR set option '${option}' is not supported by the dev-kv stub`);
        }
        const existing = live(key);
        if ((mode === 'nx' && existing) || (mode === 'xx' && !existing)) return null;
        data.set(key, { value, expiresAt: keepTtl ? existing?.expiresAt : expiresAt });
        return 'OK';
      }
      case 'del':
        return args.filter((key) => live(key) && data.delete(key)).length;
      case 'expire':
        return expireIn(args[0], Number(args[1]) * 1000);
      case 'pexpire':
        return expireIn(args[0], Number(args[1]));
      case 'incr':
        return incrBy(args[0], 1);
      case 'incrby':
        return incrBy(args[0], Number(args[1]));
      case 'hsetnx': {
        const [key, field, value] = args;
        const hash = hashAt(key, true);
        if (hash.has(field)) return 0;
        hash.set(field, value);
        return 1;
      }
      case 'hset': {
        const [key, ...pairs] = args;
        const hash = hashAt(key, true);
        let added = 0;
        for (let i = 0; i < pairs.length; i += 2) {
          if (!hash.has(pairs[i])) added++;
          hash.set(pairs[i], pairs[i + 1]);
        }
        return added;
      }
      case 'hgetall':
        return [...(hashAt(args[0])?.entries() ?? [])].flat();
      case 'hdel': {
        const [key, ...fields] = args;
        const hash = hashAt(key);
        if (!hash) return 0;
        const removed = fields.filter((field) => hash.delete(field)).length;
        if (hash.size === 0) data.delete(key);
        return removed;
      }
      case 'eval':
      case 'evalsha': {
        const numKeys = Number(args[1]);
        return slidingWindow(args.slice(2, 2 + numKeys), args.slice(2 + numKeys));
      }
      default:
        throw new CommandError(`ERR unknown command '${name}' (not supported by the dev-kv stub)`);
    }
  }

  return { exec };
}

/** Upstash's base64 response encoding: every string except "OK", recursively through arrays. */
function encode(result) {
  if (typeof result === 'string') return result === 'OK' ? result : Buffer.from(result, 'utf8').toString('base64');
  if (Array.isArray(result)) return result.map(encode);
  return result;
}

/** HTTP server speaking Upstash's REST protocol: POST / (one command), /pipeline and /multi-exec. */
export function createDevKvServer(store = createStore()) {
  return http.createServer((req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'POST') return send(405, { error: 'ERR dev-kv stub only accepts POST' });

    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return send(400, { error: 'ERR malformed JSON body' });
      }
      const base64 = String(req.headers['upstash-encoding'] ?? '').toLowerCase() === 'base64';
      const run = (command) => {
        try {
          const result = store.exec(command);
          return { result: base64 ? encode(result) : result };
        } catch (err) {
          if (!(err instanceof CommandError)) console.error('[dev-kv]', err);
          return { error: err instanceof Error ? err.message : String(err) };
        }
      };

      const route = (req.url ?? '/').split('?')[0].replace(/\/+$/, '');
      if (route === '/pipeline' || route === '/multi-exec') {
        if (!Array.isArray(body)) return send(400, { error: 'ERR pipeline body must be an array of commands' });
        return send(200, body.map(run));
      }
      if (route !== '') return send(404, { error: `ERR unknown path ${route}` });
      const reply = run(body);
      return send(reply.error ? 400 : 200, reply);
    });
  });
}

// The local baby-guess Host token. Never hard-coded: taken from BABY_GUESS_HOST_TOKEN if set,
// otherwise kept in the macOS Keychain (created on first run), otherwise random per run.
const KEYCHAIN_SERVICE = 'baby-guess local host token';

function localHostToken() {
  if (process.env.BABY_GUESS_HOST_TOKEN) return { token: process.env.BABY_GUESS_HOST_TOKEN, where: 'BABY_GUESS_HOST_TOKEN' };
  if (process.platform !== 'darwin') {
    return { token: randomBytes(24).toString('hex'), where: 'nowhere (random for this run; set BABY_GUESS_HOST_TOKEN to keep one)' };
  }
  const lookup = ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', process.env.USER ?? 'dev', '-w'];
  try {
    return { token: execFileSync('security', lookup, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(), where: 'keychain' };
  } catch {
    const token = randomBytes(24).toString('hex');
    execFileSync('security', ['add-generic-password', '-s', KEYCHAIN_SERVICE, '-a', process.env.USER ?? 'dev', '-w', token], { stdio: 'ignore' });
    return { token, where: 'keychain' };
  }
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const port = Number(process.env.DEV_KV_PORT ?? 8079);
  const { token: hostToken, where } = localHostToken();
  const server = createDevKvServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`[dev-kv] in-memory Redis stub on http://127.0.0.1:${port} (data is lost when this stops)`);
    console.log(
      where === 'keychain'
        ? `[dev-kv] baby-guess Host token is in your Keychain ("${KEYCHAIN_SERVICE}"). Copy it with:\n` +
            `         security find-generic-password -s '${KEYCHAIN_SERVICE}' -w | pbcopy`
        : `[dev-kv] baby-guess Host token comes from ${where}`,
    );

    // process.env wins over .env in readEnv(), so these point the lab at the stub even when
    // .env holds real (or [SENSITIVE]) KV values.
    const astro = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', '.bin', 'astro');
    const child = spawn(astro, ['dev', ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: {
        ...process.env,
        KV_REST_API_URL: `http://127.0.0.1:${port}`,
        KV_REST_API_TOKEN: 'dev-kv',
        VERCEL_ENV: 'development',
        BABY_GUESS_HOST_TOKEN: hostToken,
      },
    });
    child.on('exit', (code) => {
      // Astro detaches the dev server when it isn't attached to a terminal; keep the stub up for it.
      if (code === 0) console.log('[dev-kv] astro dev is in the background (stop it with `npx astro dev stop`). Ctrl-C stops the stub.');
      else shutdown(code ?? 1);
    });
    const shutdown = (code = 0) => {
      child.kill();
      server.close(() => process.exit(code));
    };
    process.on('SIGINT', () => shutdown());
    process.on('SIGTERM', () => shutdown());
  });
}
