import '@fontsource/im-fell-english/400.css';
import landUrl from '../_data/basemap/land.json?url';
import lakesUrl from '../_data/basemap/lakes.json?url';
import riversUrl from '../_data/basemap/rivers.json?url';
import { borders } from '../_layers/borders';
import { population } from '../_layers/population';
import { statehood } from '../_layers/statehood';
import { fetchJson } from './fetch';
import { loadLayers, renderLayers } from './layers';
import { skinAt } from './skins';
import { createStage } from './stage';

const LAYERS = [borders, population, statehood];
const SECONDS_PER_DECADE = 3;

export async function start(root: HTMLElement) {
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const status = $('[data-status]');
  const slider = $('[data-year-input]') as HTMLInputElement;
  const label = $('[data-year-label]');
  const play = $('[data-play]') as HTMLButtonElement;
  try {
    await Promise.all([document.fonts.load('16px "IM Fell English"'), document.fonts.load('16px "Inter"'), document.fonts.load('16px "JetBrains Mono"')]);
    const [base, loaded] = await Promise.all([
      Promise.all([fetchJson(landUrl), fetchJson(lakesUrl), fetchJson(riversUrl)]).then(([land, lakes, rivers]) => ({ land, lakes, rivers })),
      loadLayers(LAYERS),
    ]);
    const stage = createStage($('[data-map]'), $('[data-texture]'), base, skinAt(1790));
    let year = Number(new URLSearchParams(location.search).get('year')) || 1790;
    year = Math.min(2020, Math.max(1790, year));
    const draw = () => {
      const s = { year, skin: skinAt(year), phase: '2d' as const, depth: 0 };
      stage.update(s, renderLayers(loaded, s));
      slider.value = String(year);
      label.textContent = String(Math.floor(year));
      label.style.fontFamily = s.skin.fontMix < 0.5 ? s.skin.fontFrom : s.skin.fontTo;
      label.style.color = s.skin.text;
    };
    slider.addEventListener('input', () => { year = Number(slider.value); draw(); });
    let raf = 0, last = 0;
    const tick = (t: number) => {
      if (last) year = Math.min(2020, year + ((t - last) / 1000) * (10 / SECONDS_PER_DECADE));
      last = t; draw();
      if (year < 2020) raf = requestAnimationFrame(tick); else { play.textContent = 'Play'; raf = 0; }
    };
    play.addEventListener('click', () => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; play.textContent = 'Play'; return; }
      if (year >= 2020) year = 1790;
      last = 0; play.textContent = 'Pause'; raf = requestAnimationFrame(tick);
    });
    draw();
    status.remove();
  } catch (err) {
    status.textContent = `The map couldn't load: ${err instanceof Error ? err.message : String(err)}`;
    console.error(err);
  }
}
