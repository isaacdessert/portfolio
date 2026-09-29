import { describe, it, expect } from 'vitest';
import { parseEspnInjuries } from './espn';
import fixture from './__fixtures__/espn-sample.json';

describe('parseEspnInjuries — real ESPN fixture', () => {
  const rows = parseEspnInjuries(fixture);

  it('keeps only fantasy-relevant, non-Active entries', () => {
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r.name)).toEqual([
      'Colbie Young',
      'Marvin Mims Jr.',
      'Xavier Legette',
      'Jalen Coker',
      'Jonah Coleman',
      'Andrei Iosivas',
      'Jonathon Brooks',
    ]);
  });

  it('excludes non-fantasy positions (LB, DT) even when injured', () => {
    expect(rows.some((r) => r.name === 'Devin Lloyd')).toBe(false);
    expect(rows.some((r) => r.name === 'B.J. Hill')).toBe(false);
  });

  it('excludes Active status regardless of position', () => {
    expect(rows.some((r) => r.name === 'Haynes King')).toBe(false);
    expect(rows.some((r) => r.name === 'Tanner Hudson')).toBe(false);
    expect(rows.some((r) => r.name === 'Wil Lutz')).toBe(false);
  });

  it('maps "Injured Reserve" to "IR", other statuses pass through', () => {
    const brooks = rows.find((r) => r.name === 'Jonathon Brooks');
    expect(brooks?.status).toBe('IR');
    const young = rows.find((r) => r.name === 'Colbie Young');
    expect(young?.status).toBe('Out');
    const coker = rows.find((r) => r.name === 'Jalen Coker');
    expect(coker?.status).toBe('Questionable');
  });

  it('builds the injury string with side when side is set and not "Not Specified"', () => {
    const young = rows.find((r) => r.name === 'Colbie Young');
    expect(young?.injury).toBe('Knee (Left)');
    const brooks = rows.find((r) => r.name === 'Jonathon Brooks');
    expect(brooks?.injury).toBe('Abdomen');
  });

  it('carries team, returnDate, updated, blurb, and url', () => {
    const legette = rows.find((r) => r.name === 'Xavier Legette');
    expect(legette).toMatchObject({
      id: '-2018947',
      pos: 'WR',
      team: 'CAR',
      returnDate: '2026-10-04',
      updated: '2026-09-28T18:17Z',
      blurb: 'out',
      url: 'https://www.espn.com/nfl/player/_/id/4430034/xavier-legette',
    });
  });

  it('sorts by updated date newest first', () => {
    const updated = rows.map((r) => r.updated);
    const sorted = [...updated].sort().reverse();
    expect(updated).toEqual(sorted);
  });
});

describe('parseEspnInjuries — synthetic edge cases', () => {
  const entry = (overrides: Record<string, unknown> = {}) => ({
    id: '1',
    displayName: 'Team',
    injuries: [
      {
        id: '100',
        status: 'Out',
        date: '2026-09-29T00:00Z',
        shortComment: 'blurb',
        longComment: 'long',
        athlete: {
          displayName: 'Some Kicker',
          position: { abbreviation: 'PK' },
          team: { abbreviation: 'DEN', displayName: 'Denver Broncos' },
          links: [{ href: 'https://espn.com/player/1' }],
        },
        type: {},
        ...overrides,
      },
    ],
  });

  it('maps PK to K', () => {
    const [row] = parseEspnInjuries({ injuries: [entry()] });
    expect(row.pos).toBe('K');
  });

  it('passes "Doubtful" through unchanged', () => {
    const raw = entry({ status: 'Doubtful' });
    const [row] = parseEspnInjuries({ injuries: [raw] });
    expect(row.status).toBe('Doubtful');
  });

  it('drops a javascript: href instead of passing it through as url', () => {
    const raw = entry();
    const athlete = (raw.injuries[0] as Record<string, unknown>).athlete as Record<string, unknown>;
    athlete.links = [{ href: 'javascript:alert(1)' }];
    const [row] = parseEspnInjuries({ injuries: [raw] });
    expect(row.url).toBeUndefined();
  });

  it('defaults blurb to empty string when shortComment is missing', () => {
    const raw = entry();
    delete (raw.injuries[0] as Record<string, unknown>).shortComment;
    const [row] = parseEspnInjuries({ injuries: [raw] });
    expect(row.blurb).toBe('');
  });

  it('skips entries missing athlete', () => {
    const raw = entry();
    delete (raw.injuries[0] as Record<string, unknown>).athlete;
    expect(parseEspnInjuries({ injuries: [raw] })).toEqual([]);
  });

  it('skips entries missing athlete.displayName', () => {
    const raw = entry();
    const athlete = (raw.injuries[0] as Record<string, unknown>).athlete as Record<string, unknown>;
    delete athlete.displayName;
    expect(parseEspnInjuries({ injuries: [raw] })).toEqual([]);
  });

  it('skips entries missing athlete.position', () => {
    const raw = entry();
    const athlete = (raw.injuries[0] as Record<string, unknown>).athlete as Record<string, unknown>;
    delete athlete.position;
    expect(parseEspnInjuries({ injuries: [raw] })).toEqual([]);
  });

  it('throws on an empty object', () => {
    expect(() => parseEspnInjuries({})).toThrow('Unexpected ESPN injuries format');
  });

  it('throws on null', () => {
    expect(() => parseEspnInjuries(null)).toThrow('Unexpected ESPN injuries format');
  });

  it('throws when injuries is not an array', () => {
    expect(() => parseEspnInjuries({ injuries: 'x' })).toThrow('Unexpected ESPN injuries format');
  });
});
