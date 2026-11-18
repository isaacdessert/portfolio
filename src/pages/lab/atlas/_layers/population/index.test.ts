import { describe, it, expect } from 'vitest';
import populationJson from '../../_data/population.json';
import eventsJson from '../../_data/events.json';
import centroidsJson from '../../_data/centroids.json';
import { skinAt } from '../../_engine/skins';
import { activeStates, buildPopulationData, formatPopulation, population, radiusPx } from './index';

const data = buildPopulationData(populationJson, eventsJson, centroidsJson);
const st = (year: number, depth = 0) => ({ year, skin: skinAt(year), phase: depth > 0 ? '3d' as const : '2d' as const, depth });

describe('population layer', () => {
  it('shows only admitted states, never DC', () => {
    expect(activeStates(data, 1790).map((s) => s.abbr).sort()).toHaveLength(12); // RI joins 1790-05-29
    expect(activeStates(data, 2020).map((s) => s.abbr)).not.toContain('DC');
    expect(activeStates(data, 2020)).toHaveLength(50);
  });
  it('adds a state exactly at its admission date (California 1850-09-09)', () => {
    expect(activeStates(data, 1850.5).map((s) => s.abbr)).not.toContain('CA');
    expect(activeStates(data, 1850.75).map((s) => s.abbr)).toContain('CA');
  });
  it('sizes circles by sqrt(population)', () => {
    expect(radiusPx(40_000_000)).toBeCloseTo(36, 6);
    expect(radiusPx(10_000_000)).toBeCloseTo(18, 6);
    expect(radiusPx(0)).toBe(0);
  });
  it('holds 2020 values after 2020 and never produces NaN', () => {
    const ca2050 = activeStates(data, 2050).find((s) => s.abbr === 'CA')!;
    expect(ca2050.value).toBe((populationJson.states as any).CA['2020']);
    for (const s of activeStates(data, 1791)) expect(Number.isFinite(radiusPx(s.value))).toBe(true);
  });
  it('renders circles in 2D and columns when depth > 0', () => {
    expect(population.render(data, st(1900)).map((l) => l.id)).toEqual(['population-circles', 'population-labels']);
    const ids3d = population.render(data, st(2020, 0.5)).map((l) => l.id);
    expect(ids3d).toEqual(expect.arrayContaining(['population-circles', 'population-columns']));
    expect(population.render(data, st(2020, 1)).map((l) => l.id)).not.toContain('population-circles');
  });
  it('provides a legend', () => {
    expect(population.legend!(data, st(1900))!.items.map((i) => i.label)).toEqual(['1M', '10M', '30M']);
  });
  it('formatPopulation keeps one decimal under 10M and strips trailing .0', () => {
    expect(formatPopulation(1e6)).toBe('1M');
    expect(formatPopulation(1.4e6)).toBe('1.4M');
    expect(formatPopulation(3e7)).toBe('30M');
    expect(formatPopulation(39.5e6)).toBe('40M');
    expect(formatPopulation(92_597)).toBe('93K');
  });
});
