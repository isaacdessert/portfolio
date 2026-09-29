import { HttpError } from '@lab/api';
import { ESPN_INJURIES_URL, parseEspnInjuries, type InjuryRow } from './espn';

export const FRESH_SECONDS = 600;

export interface Feed {
  fetchedAt: string;
  rows: InjuryRow[];
  stale?: boolean;
}

export interface FeedDeps {
  store: {
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: unknown, opts?: { ex?: number }): Promise<void>;
  };
  fetchEspn: () => Promise<unknown>;
  now: () => Date;
}

export async function getFeed(deps: FeedDeps): Promise<Feed> {
  const fresh = await deps.store.get<Feed>('fresh');
  if (fresh) return fresh;

  try {
    const raw = await deps.fetchEspn();
    const rows = parseEspnInjuries(raw);
    const feed: Feed = { fetchedAt: deps.now().toISOString(), rows };
    await deps.store.set('fresh', feed, { ex: FRESH_SECONDS });
    await deps.store.set('last', feed);
    return feed;
  } catch (err) {
    console.error(err);
    const last = await deps.store.get<Feed>('last');
    if (last) return { ...last, stale: true };
    throw new HttpError(502, 'ESPN feed unavailable');
  }
}

export async function fetchEspnJson(): Promise<unknown> {
  const res = await fetch(ESPN_INJURIES_URL, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`ESPN injuries request failed: ${res.status}`);
  return res.json();
}
