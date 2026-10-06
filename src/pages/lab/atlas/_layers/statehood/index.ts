import { ScatterplotLayer } from '@deck.gl/layers';
import eventsUrl from '../../_data/events.json?url';
import centroidsUrl from '../../_data/centroids.json?url';
import { toRgba } from '../../_engine/color';
import { skinKey } from '../../_engine/skins';
import { dateToYear } from '../../_engine/time';
import type { DataLayer } from '../../_engine/types';

export const RING_YEARS = 0.6;
type Ev = { date: string; year: number; kind: string; text: string; state?: string };
export interface StatehoodData { events: Ev[]; centroids: Record<string, [number, number]> }
type Ring = { position: [number, number]; progress: number };

export function buildStatehoodData(events: any, centroids: any): StatehoodData {
  return { events: events.events.map((e: any) => ({ ...e, year: dateToYear(e.date) })), centroids };
}

export function ringsAt(data: StatehoodData, year: number): Ring[] {
  return data.events
    .filter((e) => e.state && data.centroids[e.state] && year >= e.year && year - e.year <= RING_YEARS)
    .map((e) => ({ position: data.centroids[e.state!], progress: (year - e.year) / RING_YEARS }));
}

export const statehood: DataLayer<StatehoodData> = {
  id: 'statehood',
  async load() {
    const get = async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
    const [e, c] = await Promise.all([get(eventsUrl), get(centroidsUrl)]);
    return buildStatehoodData(e, c);
  },
  events(data) {
    return data.events.map((e) => ({ date: e.date, year: e.year, text: e.text, ...(e.state ? { focus: e.state } : {}) }));
  },
  render(data, s) {
    const key = skinKey(s.skin);
    return [new ScatterplotLayer<Ring>({
      id: 'statehood-rings', data: ringsAt(data, s.year),
      getPosition: (r) => r.position, radiusUnits: 'pixels', getRadius: (r) => 20 + 40 * r.progress,
      filled: false, stroked: true, lineWidthUnits: 'pixels', getLineWidth: 2.5,
      getLineColor: (r) => toRgba(s.skin.dataStroke, 1 - r.progress),
      updateTriggers: { getRadius: s.year, getLineColor: [s.year, key] },
    })];
  },
};
