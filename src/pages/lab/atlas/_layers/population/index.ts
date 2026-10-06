import { ColumnLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';
import populationUrl from '../../_data/population.json?url';
import eventsUrl from '../../_data/events.json?url';
import centroidsUrl from '../../_data/centroids.json?url';
import { valueAtYear } from '../../_engine/interpolate';
import { toRgba } from '../../_engine/color';
import { skinKey } from '../../_engine/skins';
import { yearToDate } from '../../_engine/time';
import type { DataLayer } from '../../_engine/types';

export const MAX_POPULATION = 40_000_000;
export interface PopulationData {
  series: Record<string, Record<string, number>>;
  admitted: Record<string, string>;
  names: Record<string, string>;
  centroids: Record<string, [number, number]>;
}
type Active = { abbr: string; value: number; position: [number, number]; name: string };

export function buildPopulationData(population: any, events: any, centroids: any): PopulationData {
  const admitted: Record<string, string> = {};
  const names: Record<string, string> = {};
  for (const e of events.events) {
    if ((e.kind === 'ratification' || e.kind === 'admission') && e.state) {
      admitted[e.state] = e.date;
      names[e.state] = e.name;
    }
  }
  return { series: population.states, admitted, names, centroids };
}

export const radiusPx = (value: number) => Math.sqrt(Math.max(0, value) / MAX_POPULATION) * 36;

export function activeStates(data: PopulationData, year: number): Active[] {
  const date = yearToDate(year);
  return Object.entries(data.admitted)
    .filter(([abbr, joined]) => joined <= date && data.centroids[abbr] && data.series[abbr])
    .map(([abbr]) => ({ abbr, name: data.names[abbr], position: data.centroids[abbr], value: valueAtYear(data.series[abbr], year) }))
    .sort((a, b) => b.value - a.value);
}

const fmt = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : `${Math.round(v / 1e3)}K`);

export const population: DataLayer<PopulationData> = {
  id: 'population',
  async load() {
    const get = async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
    const [p, e, c] = await Promise.all([get(populationUrl), get(eventsUrl), get(centroidsUrl)]);
    return buildPopulationData(p, e, c);
  },
  render(data, s) {
    const states = activeStates(data, s.year);
    const key = skinKey(s.skin);
    const layers: Layer[] = [];
    if (s.depth < 1) {
      layers.push(new ScatterplotLayer<Active>({
        id: 'population-circles', data: states,
        getPosition: (d) => d.position, getRadius: (d) => radiusPx(d.value), radiusUnits: 'pixels',
        stroked: true, lineWidthUnits: 'pixels', getLineWidth: 1.2,
        getFillColor: toRgba(s.skin.dataFill, s.skin.dataOpacity * (1 - s.depth)),
        getLineColor: toRgba(s.skin.dataStroke, 1 - s.depth),
        updateTriggers: { getRadius: s.year, getFillColor: [key, s.depth], getLineColor: [key, s.depth] },
      }));
    }
    if (s.depth > 0) {
      layers.push(new ColumnLayer<Active>({
        id: 'population-columns', data: states, diskResolution: 24, radius: 30_000, extruded: true,
        getPosition: (d) => d.position, getElevation: (d) => (d.value / MAX_POPULATION) * 800_000 * s.depth,
        getFillColor: toRgba(s.skin.dataFill, s.depth),
        updateTriggers: { getElevation: [s.year, s.depth], getFillColor: [key, s.depth] },
      }));
    }
    if (s.depth === 0) {
      layers.push(new TextLayer<Active>({
        id: 'population-labels', data: states.slice(0, 5),
        getPosition: (d) => d.position, getText: (d) => fmt(d.value), getSize: 11,
        getPixelOffset: (d) => [0, radiusPx(d.value) + 9], getColor: toRgba(s.skin.text),
        fontFamily: s.skin.fontMix < 0.5 ? s.skin.fontFrom : s.skin.fontTo, characterSet: 'auto',
        updateTriggers: { getText: s.year, getPixelOffset: s.year, getColor: key },
      }));
    }
    return layers;
  },
  legend(_data, s) {
    return { title: 'Population', items: [1e6, 1e7, 3e7].map((v) => ({ label: fmt(v), size: radiusPx(v), color: s.skin.dataFill })) };
  },
};
