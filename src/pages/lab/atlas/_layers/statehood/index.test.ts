import { describe, it, expect } from 'vitest';
import eventsJson from '../../_data/events.json';
import centroidsJson from '../../_data/centroids.json';
import { dateToYear } from '../../_engine/time';
import { skinAt } from '../../_engine/skins';
import { buildStatehoodData, ringsAt, statehood, RING_YEARS } from './index';

const data = buildStatehoodData(eventsJson, centroidsJson);

describe('statehood layer', () => {
  it('contributes every event as a timeline caption, with focus for joins', () => {
    const ev = statehood.events!(data);
    expect(ev).toHaveLength(eventsJson.events.length);
    expect(ev.find((e) => e.text.includes('West Virginia'))).toMatchObject({ focus: 'WV', date: '1863-06-20' });
    expect(ev.find((e) => e.text.includes('Louisiana Purchase'))!.focus).toBeUndefined();
  });

  it('shows a ring only during the window after a join', () => {
    const wv = dateToYear('1863-06-20');
    expect(ringsAt(data, wv - 0.01)).toHaveLength(0);
    expect(ringsAt(data, wv + 0.1)).toHaveLength(1);
    expect(ringsAt(data, wv + 0.1)[0].progress).toBeCloseTo(0.1 / RING_YEARS, 3);
    expect(ringsAt(data, wv + RING_YEARS + 0.01)).toHaveLength(0);
  });

  it('renders a rings layer', () => {
    const s = { year: dateToYear('1863-06-20') + 0.1, skin: skinAt(1863), phase: '2d' as const, depth: 0 };
    expect(statehood.render(data, s).map((l) => l.id)).toEqual(['statehood-rings']);
  });
});
