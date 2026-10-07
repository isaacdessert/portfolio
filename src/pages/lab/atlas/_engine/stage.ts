import { Map as MapLibreMap, AttributionControl } from 'maplibre-gl';
import type { IControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import type { Layer } from '@deck.gl/core';
import { buildStyle, paintUpdates, type BaseMap } from './style';
import type { EraSkin } from './skins';
import type { StoryState } from './types';

export interface Stage { update(s: StoryState, layers: Layer[]): void; destroy(): void }

const CREDITS = [
  'Borders: Newberry Library, Atlas of Historical County Boundaries (CC BY-NC-SA 2.5)',
  'Population: US Census Bureau',
  'Base map: Natural Earth',
  'Terrain: AWS Terrain Tiles',
];

export function createStage(container: HTMLElement, texture: HTMLElement, base: BaseMap, initial: EraSkin): Stage {
  const map = new MapLibreMap({
    container, style: buildStyle(initial, base),
    center: [-96, 38.5], zoom: 3.3, minZoom: 2, maxZoom: 8, attributionControl: false,
  });
  map.addControl(new AttributionControl({ compact: true, customAttribution: CREDITS }));
  const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
  map.addControl(overlay as unknown as IControl);
  let lastKey = '';
  return {
    update(s, layers) {
      const key = JSON.stringify(paintUpdates(s.skin));
      if (key !== lastKey && map.isStyleLoaded()) {
        for (const [id, prop, value] of paintUpdates(s.skin)) map.setPaintProperty(id, prop, value);
        lastKey = key;
      }
      texture.style.opacity = String(s.skin.texture);
      overlay.setProps({ layers });
    },
    destroy() { map.remove(); },
  };
}
