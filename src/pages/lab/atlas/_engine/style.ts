import type { StyleSpecification } from 'maplibre-gl';
import type { EraSkin } from './skins';

export interface BaseMap { land: GeoJSON.FeatureCollection; lakes: GeoJSON.FeatureCollection; rivers: GeoJSON.FeatureCollection }
export const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

export function paintUpdates(skin: EraSkin): [string, string, string | number][] {
  return [
    ['water', 'background-color', skin.water],
    ['land', 'fill-color', skin.paper],
    ['hillshade', 'hillshade-exaggeration', skin.hillshade],
    ['hillshade', 'hillshade-shadow-color', skin.coast],
    ['lakes', 'fill-color', skin.water],
    ['rivers', 'line-color', skin.river],
    ['coast', 'line-color', skin.coast],
    ['coast', 'line-width', skin.coastWidth],
  ];
}

export function buildStyle(skin: EraSkin, base: BaseMap): StyleSpecification {
  const style = {
    version: 8,
    sources: {
      land: { type: 'geojson', data: base.land },
      lakes: { type: 'geojson', data: base.lakes },
      rivers: { type: 'geojson', data: base.rivers },
      dem: { type: 'raster-dem', tiles: [TERRAIN_TILES], tileSize: 256, encoding: 'terrarium', maxzoom: 12 },
    },
    layers: [
      { id: 'water', type: 'background', paint: {} },
      { id: 'land', type: 'fill', source: 'land', paint: {} },
      { id: 'hillshade', type: 'hillshade', source: 'dem', paint: { 'hillshade-highlight-color': 'rgba(255,255,255,0.15)' } },
      { id: 'lakes', type: 'fill', source: 'lakes', paint: {} },
      { id: 'rivers', type: 'line', source: 'rivers', paint: { 'line-width': 0.8 } },
      { id: 'coast', type: 'line', source: 'land', paint: {} },
    ],
  } as unknown as StyleSpecification;
  for (const [id, prop, value] of paintUpdates(skin)) {
    const layer = style.layers.find((l) => l.id === id)!;
    (layer as unknown as { paint: Record<string, unknown> }).paint[prop] = value;
  }
  return style;
}
