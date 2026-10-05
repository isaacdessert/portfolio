import { mixColor } from './color';

export interface SkinTokens {
  water: string;
  paper: string;
  landPalette: string[];
  territory: string;
  border: string;
  borderWidth: number;
  coast: string;
  coastWidth: number;
  river: string;
  hillshade: number;
  texture: number;
  text: string;
  dataFill: string;
  dataStroke: string;
  dataOpacity: number;
  font: string;
}

export type EraSkin = Omit<SkinTokens, 'font'> & { fontFrom: string; fontTo: string; fontMix: number };

export const ANCHORS: { year: number; name: 'antique' | 'atlas' | 'modern'; tokens: SkinTokens }[] = [
  {
    year: 1790,
    name: 'antique',
    tokens: {
      water: '#d9cfb0',
      paper: '#e8d9b5',
      landPalette: ['#e0cc9f', '#e0cc9f', '#e0cc9f', '#e0cc9f', '#e0cc9f'],
      territory: '#e8d9b5',
      border: '#6b4a1f',
      borderWidth: 1,
      coast: '#4a3214',
      coastWidth: 1.6,
      river: '#7a96a8',
      hillshade: 0.5,
      texture: 0.9,
      text: '#3b2a12',
      dataFill: '#7a1f12',
      dataStroke: '#5a160d',
      dataOpacity: 0.18,
      font: 'IM Fell English',
    },
  },
  {
    year: 1900,
    name: 'atlas',
    tokens: {
      water: '#bcd9ea',
      paper: '#ece6d4',
      landPalette: ['#f6d6c8', '#f9edb9', '#d4ebc9', '#cfe0f1', '#e9d3ea'],
      territory: '#e9e4cf',
      border: '#222222',
      borderWidth: 0.8,
      coast: '#111111',
      coastWidth: 1.2,
      river: '#5b8fb9',
      hillshade: 0.25,
      texture: 0.25,
      text: '#1b1b1b',
      dataFill: '#d7261e',
      dataStroke: '#ffffff',
      dataOpacity: 0.75,
      font: 'Inter',
    },
  },
  {
    year: 2000,
    name: 'modern',
    tokens: {
      water: '#0a0f14',
      paper: '#141618',
      landPalette: ['#1d1f22', '#1d1f22', '#1d1f22', '#1d1f22', '#1d1f22'],
      territory: '#15171a',
      border: '#3a3d42',
      borderWidth: 0.7,
      coast: '#55595f',
      coastWidth: 1,
      river: '#1f3a4d',
      hillshade: 0.35,
      texture: 0,
      text: '#e8e8e8',
      dataFill: '#39ff14',
      dataStroke: '#39ff14',
      dataOpacity: 0.28,
      font: 'JetBrains Mono',
    },
  },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function blend(a: SkinTokens, b: SkinTokens, t: number): EraSkin {
  return {
    water: mixColor(a.water, b.water, t),
    paper: mixColor(a.paper, b.paper, t),
    landPalette: a.landPalette.map((c, i) => mixColor(c, b.landPalette[i], t)),
    territory: mixColor(a.territory, b.territory, t),
    border: mixColor(a.border, b.border, t),
    borderWidth: lerp(a.borderWidth, b.borderWidth, t),
    coast: mixColor(a.coast, b.coast, t),
    coastWidth: lerp(a.coastWidth, b.coastWidth, t),
    river: mixColor(a.river, b.river, t),
    hillshade: lerp(a.hillshade, b.hillshade, t),
    texture: lerp(a.texture, b.texture, t),
    text: mixColor(a.text, b.text, t),
    dataFill: mixColor(a.dataFill, b.dataFill, t),
    dataStroke: mixColor(a.dataStroke, b.dataStroke, t),
    dataOpacity: lerp(a.dataOpacity, b.dataOpacity, t),
    fontFrom: a.font,
    fontTo: b.font,
    fontMix: a.font === b.font ? 0 : smoothstep(0.4, 0.6, t),
  };
}

/** The era look for a fractional year: blended between neighbouring anchors, clamped at the ends. */
export function skinAt(year: number): EraSkin {
  const first = ANCHORS[0],
    last = ANCHORS[ANCHORS.length - 1];
  if (year <= first.year) return blend(first.tokens, first.tokens, 0);
  if (year >= last.year) return blend(last.tokens, last.tokens, 0);
  const i = ANCHORS.findIndex((a) => a.year > year) - 1;
  const a = ANCHORS[i],
    b = ANCHORS[i + 1];
  return blend(a.tokens, b.tokens, (year - a.year) / (b.year - a.year));
}

/** Stable key for deck.gl updateTriggers (changes whenever any token changes). */
export function skinKey(s: EraSkin): string {
  return JSON.stringify(s);
}
