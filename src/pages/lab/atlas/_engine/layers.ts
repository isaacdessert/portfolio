import type { Layer } from '@deck.gl/core';
import type { DataLayer, StoryState, TimelineEvent } from './types';

export interface LoadedLayer {
  layer: DataLayer<any>;
  data: unknown;
}

export async function loadLayers(layers: DataLayer<any>[]): Promise<LoadedLayer[]> {
  return Promise.all(
    layers.map(async (layer) => {
      try {
        return { layer, data: await layer.load() };
      } catch (err) {
        throw new Error(`Layer "${layer.id}" failed to load: ${err instanceof Error ? err.message : String(err)}`);
      }
    })
  );
}

/** Renders every layer in order; a layer that throws is reported and skipped so the rest keep drawing. */
export function renderLayers(
  loaded: LoadedLayer[],
  s: StoryState,
  onError: (id: string, err: unknown) => void = (id, err) => console.error(`[atlas] layer "${id}" failed to render`, err)
): Layer[] {
  return loaded.flatMap(({ layer, data }) => {
    try {
      return layer.render(data, s);
    } catch (err) {
      onError(layer.id, err);
      return [];
    }
  });
}

export function collectEvents(loaded: LoadedLayer[]): TimelineEvent[] {
  return loaded.flatMap(({ layer, data }) => layer.events?.(data) ?? []).sort((a, b) => a.year - b.year);
}
