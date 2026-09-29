import { describe, it, expect, vi } from 'vitest';
import { getFeed, FRESH_SECONDS, type Feed, type FeedDeps } from './feed';
import { HttpError } from '@lab/api';
import type { InjuryRow } from './espn';

function fakeStore(initial: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>(Object.entries(initial));
  return {
    data,
    get: vi.fn(async <T>(key: string) => (data.has(key) ? (data.get(key) as T) : null)),
    set: vi.fn(async (key: string, value: unknown) => {
      data.set(key, value);
    }),
  };
}

const sampleRows: InjuryRow[] = [
  {
    id: '1',
    name: 'Test Player',
    pos: 'WR',
    team: 'CAR',
    status: 'Out',
    updated: '2026-09-29T00:00Z',
    blurb: 'hurt',
  },
];

const now = () => new Date('2026-09-29T12:00:00Z');

describe('getFeed', () => {
  it('returns the fresh cache without fetching', async () => {
    const fresh: Feed = { fetchedAt: '2026-09-29T11:55:00Z', rows: sampleRows };
    const store = fakeStore({ fresh });
    const fetchEspn = vi.fn();
    const deps: FeedDeps = { store, fetchEspn, now };

    const result = await getFeed(deps);

    expect(result).toEqual(fresh);
    expect(fetchEspn).not.toHaveBeenCalled();
  });

  it('fetches, parses, and stores fresh + last on a cache miss', async () => {
    const store = fakeStore();
    const rawPayload = {
      injuries: [
        {
          id: 't',
          displayName: 'Team',
          injuries: [
            {
              id: '1',
              status: 'Out',
              date: '2026-09-29T00:00Z',
              shortComment: 'hurt',
              athlete: {
                displayName: 'Test Player',
                position: { abbreviation: 'WR' },
                team: { abbreviation: 'CAR', displayName: 'Carolina Panthers' },
              },
            },
          ],
        },
      ],
    };
    const fetchEspn = vi.fn(async () => rawPayload);
    const deps: FeedDeps = { store, fetchEspn, now };

    const result = await getFeed(deps);

    expect(fetchEspn).toHaveBeenCalledTimes(1);
    expect(result.fetchedAt).toBe(now().toISOString());
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].name).toBe('Test Player');
    expect(result.stale).toBeUndefined();

    expect(store.set).toHaveBeenCalledWith('fresh', expect.objectContaining({ fetchedAt: now().toISOString() }), {
      ex: FRESH_SECONDS,
    });
    expect(store.set).toHaveBeenCalledWith('last', expect.objectContaining({ fetchedAt: now().toISOString() }));
  });

  it('returns stale last-good data when the fetch fails', async () => {
    const last: Feed = { fetchedAt: '2026-09-29T10:00:00Z', rows: sampleRows };
    const store = fakeStore({ last });
    const fetchEspn = vi.fn(async () => {
      throw new Error('network down');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps: FeedDeps = { store, fetchEspn, now };

    const result = await getFeed(deps);

    expect(result).toEqual({ ...last, stale: true });
    vi.restoreAllMocks();
  });

  it('returns stale last-good data when the payload fails to parse', async () => {
    const last: Feed = { fetchedAt: '2026-09-29T10:00:00Z', rows: sampleRows };
    const store = fakeStore({ last });
    const fetchEspn = vi.fn(async () => ({ nope: true }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps: FeedDeps = { store, fetchEspn, now };

    const result = await getFeed(deps);

    expect(result).toEqual({ ...last, stale: true });
    vi.restoreAllMocks();
  });

  it('throws HttpError 502 when the fetch fails and there is no last-good data', async () => {
    const store = fakeStore();
    const fetchEspn = vi.fn(async () => {
      throw new Error('network down');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const deps: FeedDeps = { store, fetchEspn, now };

    await expect(getFeed(deps)).rejects.toMatchObject({
      status: 502,
      message: 'ESPN feed unavailable',
    });
    await expect(getFeed(deps)).rejects.toBeInstanceOf(HttpError);
    vi.restoreAllMocks();
  });
});
