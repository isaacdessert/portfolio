# Atlas — Design

**Date:** 2026-10-02
**Status:** Approved in brainstorm (sections 1–5), pending spec review
**Project:** lab project `src/pages/lab/atlas/` → `isaacdessert.dev/lab/atlas` and `atlas.isaacdessert.dev`

## Intent

Isaac loves maps. Build a **modular framework for telling data stories on a map of the United States**, and ship its first story.

- The map **transforms with time**: an engraved antique map (1790s) → printed school atlas (mid-1900s) → clean modern map (today) → a **3D finale** where terrain rises and cities glow.
- **Data layers play on top during the transformation.** Layers are plug-ins; many can be stacked; future stories use different kinds of layers (not just circles).
- **First story:** population of each state over time, statehood dates, and border changes ("How the United States Filled In").

**Success:** delightful to watch; historically accurate (sourced data); adding the next story/layer needs no framework changes.

**Decisions made in brainstorm:** guided story (not an explorer tool); map style follows the era; population shown as **sized circles** layered over a **realistic map** (circles → columns in 3D); era looks approved from mockups (antique parchment/sepia, pastel 1950s atlas, dark site-themed modern, tilted 3D); approach **A: MapLibre GL + deck.gl**.

## 1. Stage (map engine + era transitions)

- Full-screen `LabLayout` (`fullscreen`). One **MapLibre GL** map; **deck.gl** rendered via `@deck.gl/mapbox` `MapboxOverlay` in **interleaved** mode so data layers depth-sort with 3D terrain.
- **Self-hosted base data, no tile provider or API key:**
  - Historical state/territory borders (Newberry AHCB, simplified) — see §4.
  - Natural Earth coastline, major rivers, lakes, top ~150 cities.
  - Terrain from **AWS Terrain Tiles** (Terrarium PNG, public, no key — verified reachable): `raster-dem` source → `hillshade` layer in flat eras, `setTerrain` elevation in the finale.
- **Era skins.** An `EraSkin` is a flat set of numeric/colour tokens: paper/background colour, land fill, border colour/width/dash, territory fill/hatch opacity, water colour, hillshade intensity, paper-texture opacity, label font family, data primary/secondary colours.
  - Anchors: `antique` @1790, `atlas` @1900, `modern` @2000. For years between anchors every token is **interpolated** (colours in a perceptual space, numbers linearly); before the first / after the last anchor the skin is clamped.
  - Font family is not interpolable: labels cross-fade between two text layers around the midpoint between anchors.
  - Paper texture: a committed parchment image overlay (CSS `mix-blend-mode: multiply`) whose opacity comes from the skin.
- **Labels** are deck.gl `TextLayer`s (canvas fonts → real web fonts: *IM Fell English* for antique, Inter / JetBrains Mono for modern) — avoids needing a MapLibre glyph server.
- **3D finale** (after 2020): camera pitch 0→~60°, slow bearing rotation and flight over the Rockies, terrain exaggeration 0→~1.5, city lights appear; data layers receive `depth` 0→1 (population circles → glowing columns).
- **Performance:** target 60 fps on desktop; mobile reduces terrain detail and label count. `prefers-reduced-motion`: no camera flight; scenes become prev/next steps.

## 2. Data layer plug-ins

```ts
interface StoryState {
  year: number;          // continuous, e.g. 1843.37
  skin: EraSkin;         // blended era tokens
  phase: '2d' | '3d';
  depth: number;         // 0 → 1 during the 3D finale
}

interface DataLayer<D> {
  id: string;
  load(): Promise<D>;                              // fetch its static data once
  render(data: D, s: StoryState): DeckLayer[];     // PURE: same inputs → same output
  legend?(data: D, s: StoryState): Legend | null;
  events?(data: D): TimelineEvent[];               // dated captions it contributes
}

interface TimelineEvent { date: string /* YYYY-MM-DD */; year: number; text: string; focus?: string /* state id to highlight */ }
```

Rules:
- Layers never import each other or the engine; they read colours/fonts from `skin` so any layer looks right in any era.
- Shared helpers in the engine: `valueAtYear(series, year)` (interpolation between census years — exponential between positive points, linear otherwise, 0 before first value), sqrt radius scales, centroid lookup.
- Stacking is the story's ordered `layers` array. The engine calls each layer's `render` every frame and catches per-layer errors (log + skip that layer).

**v1 layers:**
1. **`borders`** — for `year`, the state and territory polygons in effect (from Newberry start/end dates). States solid fill + border from skin; territories lighter fill with hatch; unorganized land faint. A boundary change is drawn at its effective date (polygons swap; the changed state flashes briefly via its event `focus`).
2. **`population`** — one circle per **admitted state** (v1 shows no territory circles: territorial censuses often covered land that later became several states) at its centroid; area ∝ population via `valueAtYear`; labels for the top 5. When `depth > 0`, renders `ColumnLayer` columns (height ∝ population) instead, fading circles out.
3. **`statehood`** — contributes `events()` (ratifications, admissions, major territorial changes; see §4) and a short-lived highlight ring on the event's `focus` state.

Future layers (examples, not v1): choropleth (`GeoJsonLayer` fills), flows (`ArcLayer`), animated routes (`TripsLayer`), point events (`IconLayer`), heatmaps (`HeatmapLayer`).

## 3. Story & playback

A story is one config module (`_stories/population.ts`):

```ts
export const story: Story = {
  id: 'population',
  title: 'How the United States Filled In',
  years: [1790, 2020],
  layers: [borders, population, statehood],
  pacing: { secondsPerDecade: 3 },
  scenes: [
    { year: 1790, camera: EAST_COAST, caption: 'First census: 3.9 million people' },
    { year: 1803, camera: CONTINENT, caption: 'Louisiana Purchase doubles the nation' },
    // … Alaska/Hawaii camera visits at 1867, 1898, 1959 …
    { year: 2020, camera: FULL_US },
    { finale: true, duration: 15, camera: [TILT_60, FLY_ROCKIES, OVERVIEW] },
  ],
};
```

- **Clock:** `year` advances continuously at `secondsPerDecade`; it eases to a slower rate within a window around scenes and layer events so captions are readable (target total ≈ 70 s of history + 15 s finale at 1×). Camera interpolates between scene keyframes (center/zoom/pitch/bearing).
- **Captions:** lower-left card (year + one line) fed by scenes and layer `events()`; queued when events are close (each shown ≥ ~2.5 s).
- **Big year numeral** in the skin's label font. **Legend** (bottom-right) from layers' `legend()`.
- **Controls** (auto-hiding, site style): play/pause, scrubbable timeline with decade ticks + hoverable event dots, 1×/2×, replay. Keyboard: Space, ←/→ (one decade).
- **Start:** title card over the antique map with a Play button (no motion autoplay). **End:** settles into a slowly rotating 3D overview with Replay.
- **Deep link:** `?year=1863` opens paused at that year (clamped to `years`).
- **Reduced motion:** Prev/Next steps through scenes; no camera flight.
- **Out of scope for v1:** free-explore mode / click a state for stats, story picker, sound.

## 4. Data pipeline

All data is prepared offline by scripts in `_scripts/` (run manually; outputs committed to `_data/`). Runtime fetches only these static files plus terrain tiles.

1. **Borders** — Newberry Library *Atlas of Historical County Boundaries*, "US Historical States & Territories (1783–2000)", generalized file `US_AtlasHCB_StateTerr_Gen01.zip` (~2 MB). License: the downloaded files carry **CC BY-NC-SA 2.5** (the website also says reuse is free "for any lawful purpose"); we follow the stricter terms — non-commercial use, attribution to the Newberry Library, and our derived `borders.topo.json` carries the same license in its metadata. Script: unzip → convert shapefile → simplify further → keep `{ id, name, kind: 'state'|'territory'|'other', start, end }` → write **TopoJSON** `_data/borders.topo.json`. Shapes with an end date of 2000-12-31 are treated as continuing to the present (no state borders changed after 2000).
2. **Population** — `_data/population.json`: `{ [stateId]: { [censusYear]: number } }`, 1790–2020, from US Census Bureau historical decennial counts (public domain), as compiled per **present-day state boundaries** in Wikipedia's "List of U.S. states and territories by historical population" (state rows sum to the national census totals within 0.01%); source cited in the file's metadata.
3. **Events** — `_data/events.json`, hand-curated: ratification dates of the original 13, all 37 admissions (exact dates), and major territorial changes: Louisiana Purchase 1803, Maine from Massachusetts 1820, Texas annexation 1845, Oregon Treaty 1846, Mexican Cession 1848, Gadsden Purchase 1853, West Virginia 1863, Alaska Purchase 1867, Dakota split 1889, Hawaii annexation 1898, Alaska and Hawaii statehood 1959.
4. **Base map** — Natural Earth (public domain) 1:50m coastline, rivers, lakes; populated places (top ~150 by population) → simplified GeoJSON in `_data/basemap/`.

- **Size budget:** all `_data/` combined ≤ ~2 MB gzipped.
- **Alaska & Hawaii:** true geography (no insets); the camera visits them at 1867/1898/1959 and they appear in the finale overview.
- **Projection:** MapLibre Web Mercator (distortion over the US is acceptable for v1).
- **Credits footer:** Newberry Library (AHCB, CC BY-NC-SA 2.5), US Census Bureau (via Wikipedia's compiled table, by present-day state boundaries), Natural Earth, AWS Terrain Tiles.
- **Accuracy:** borders show exactly what Newberry records; captions only state documented facts; data files cite sources.

## 5. Errors, testing, fit

**Errors:** no WebGL → static poster image + message; terrain tile failures → finale runs flat (tilt without elevation); data load failure → error card with Retry; a throwing layer → logged and skipped, others continue.

**Testing (Vitest, no browser/GPU):** the MapLibre/deck.gl calls sit behind a thin adapter replaced in tests.
- Era skins: exact tokens at anchors, blended midpoints, clamping, font cross-fade window.
- Clock: total duration, slowdowns near events, scene timing, `?year=` parsing/clamping, reduced-motion stepping.
- Layers (`render` purity): borders → expected state/territory counts for 1790, 1850, 1960 and specific changes (West Virginia appears 1863; Dakota Territory becomes two states 1889); population → visibility and radius at given years, columns when `depth > 0`; statehood → expected captions.
- Data integrity: each census year's state totals match published US totals; every state has an admission event; admission dates agree with when the state appears as `kind: 'state'` in borders (±1 year); story config valid (scenes within `years`, unique layer ids).
- Visual/performance verification on the Vercel preview.

**Lab fit:**
- Scaffold `npm run new atlas`; everything in `src/pages/lab/atlas/` (`_engine/`, `_layers/`, `_stories/`, `_data/`, `_scripts/`, colocated tests). Isolation holds; the engine is promoted to `src/lab/` only if another project needs it.
- New dependencies — runtime (loaded on this page only): `maplibre-gl`, `@deck.gl/core`, `@deck.gl/layers`, `@deck.gl/mapbox`, `topojson-client`; prep-only (devDependencies): a shapefile/TopoJSON tool (e.g. `mapshaper`).
- `_meta.ts` (status `wip` until the finale ships, then `live`), automatic OG card, CLAUDE.md update.

**Build order (plan milestones, each reviewable):**
1. Data pipeline + data-integrity tests.
2. Stage + era skins on the flat map.
3. The three layers.
4. Story clock, captions, controls.
5. 3D finale.
6. Fallbacks, mobile, polish.
