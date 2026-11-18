import { describe, it, expect, vi } from 'vitest';
import { ScatterplotLayer } from '@deck.gl/layers';
import { loadLayers, renderLayers, collectEvents } from './layers';
import { skinAt } from './skins';
import type { DataLayer } from './types';
const s = { year: 1850, skin: skinAt(1850), phase: '2d' as const, depth: 0 };
const ok: DataLayer<number[]> = { id: 'ok', load: async () => [1], render: (d) => [new ScatterplotLayer({ id: 'ok', data: d })],
  events: () => [{ date: '1850-01-01', year: 1850, text: 'b' }, { date: '1800-01-01', year: 1800, text: 'a' }] };
const boom: DataLayer<number[]> = { id: 'boom', load: async () => [1], render: () => { throw new Error('bad'); } };
const failing: DataLayer = { id: 'net', load: async () => { throw new Error('offline'); }, render: () => [] };
describe('layer runtime', () => {
  it('names the layer that failed to load', async () => {
    await expect(loadLayers([ok, failing])).rejects.toThrow('Layer "net" failed to load: offline');
  });
  it('skips a layer whose render throws and keeps the others', async () => {
    const onError = vi.fn();
    const out = renderLayers(await loadLayers([boom, ok]), s, onError);
    expect(out.map((l) => l.id)).toEqual(['ok']);
    expect(onError).toHaveBeenCalledWith('boom', expect.any(Error));
  });
  it('collects events sorted by year', async () => {
    expect(collectEvents(await loadLayers([ok])).map((e) => e.text)).toEqual(['a', 'b']);
  });
});
