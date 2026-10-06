import { GeoJsonLayer, TextLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';
import { feature } from 'topojson-client';
import type { Topology } from 'topojson-specification';
import bordersUrl from '../../_data/borders.topo.json?url';
import { toRgba } from '../../_engine/color';
import { skinKey } from '../../_engine/skins';
import { yearToDate } from '../../_engine/time';
import type { DataLayer, StoryState } from '../../_engine/types';
import { featuresAt, paletteIndex, type BorderFeature } from './select';

export interface BordersData { features: BorderFeature[] }

export function parseBorders(topo: unknown): BordersData {
  const t = topo as Topology;
  const fc = feature(t, t.objects.borders) as unknown as GeoJSON.FeatureCollection;
  return { features: fc.features as BorderFeature[] };
}

function labelLayer(id: string, active: BorderFeature[], s: StoryState, font: string, opacity: number): Layer {
  return new TextLayer<BorderFeature>({
    id, data: active.filter((f) => f.properties.kind !== 'other'),
    getPosition: (f) => [f.properties.lx, f.properties.ly],
    getText: (f) => f.properties.name,
    getSize: (f) => (f.properties.kind === 'state' ? 12 : 11),
    getColor: toRgba(s.skin.text, 0.85),
    fontFamily: font, fontSettings: { sdf: true }, characterSet: 'auto',
    opacity, sizeUnits: 'pixels', billboard: true,
    updateTriggers: { getColor: skinKey(s.skin) },
  });
}

export const borders: DataLayer<BordersData> = {
  id: 'borders',
  async load() {
    const res = await fetch(bordersUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseBorders(await res.json());
  },
  render(data, s) {
    const active = featuresAt(data.features, yearToDate(s.year));
    const key = skinKey(s.skin);
    const layers: Layer[] = [
      new GeoJsonLayer<any>({
        id: 'borders-polygons',
        data: { type: 'FeatureCollection', features: active },
        filled: true, stroked: true,
        getFillColor: (f: BorderFeature) =>
          f.properties.kind === 'state' ? toRgba(s.skin.landPalette[paletteIndex(f.properties.id)])
          : f.properties.kind === 'territory' ? toRgba(s.skin.territory, 0.85)
          : toRgba(s.skin.paper, 0.6),
        getLineColor: toRgba(s.skin.border),
        lineWidthUnits: 'pixels', getLineWidth: s.skin.borderWidth,
        updateTriggers: { getFillColor: key, getLineColor: key, getLineWidth: key },
      }),
      labelLayer('borders-labels', active, s, s.skin.fontFrom, 1 - s.skin.fontMix),
    ];
    if (s.skin.fontMix > 0) layers.push(labelLayer('borders-labels-next', active, s, s.skin.fontTo, s.skin.fontMix));
    return layers;
  },
};
