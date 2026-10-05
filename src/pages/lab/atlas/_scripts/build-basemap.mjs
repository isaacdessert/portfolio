// Builds _data/basemap/*.json from Natural Earth 1:50m (public domain).
// Run: node src/pages/lab/atlas/_scripts/build-basemap.mjs
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mapshaper from 'mapshaper';

const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
const OUT = fileURLToPath(new URL('../_data/basemap/', import.meta.url));
const BBOX = '-180,15,-50,72';
mkdirSync(OUT, { recursive: true });
const tmp = mkdtempSync(path.join(tmpdir(), 'atlas-basemap-'));

async function download(name) {
  const res = await fetch(`${NE}${name}.geojson`);
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  const file = path.join(tmp, `${name}.geojson`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

// ne_50m_land has no "name" field (unlike lakes/rivers); synthesize one so
// -filter-fields can run unconditionally and every layer keeps the same shape.
const layers = [
  ['ne_50m_land', 'land', '25%', true],
  ['ne_50m_lakes', 'lakes', '40%', false],
  ['ne_50m_rivers_lake_centerlines', 'rivers', '40%', false],
];
for (const [src, out, simplify, needsName] of layers) {
  const file = await download(src);
  const synthesizeName = needsName ? '-each "name=null" ' : '';
  await mapshaper.runCommands(
    `-i "${file}" -clip bbox=${BBOX} -simplify ${simplify} keep-shapes ${synthesizeName}-filter-fields name -o format=geojson precision=0.001 "${path.join(OUT, out + '.json')}"`,
  );
}

const places = JSON.parse(readFileSync(await download('ne_50m_populated_places_simple'), 'utf8'));
const us = places.features
  .filter((f) => f.properties.adm0_a3 === 'USA')
  .sort((a, b) => b.properties.pop_max - a.properties.pop_max)
  .slice(0, 150)
  .map((f) => ({ type: 'Feature', properties: { name: f.properties.name, pop: f.properties.pop_max },
    geometry: { type: 'Point', coordinates: f.geometry.coordinates.map((c) => +c.toFixed(3)) } }));
writeFileSync(path.join(OUT, 'cities.json'), JSON.stringify({ type: 'FeatureCollection', features: us }));
console.log(`basemap written; cities: ${us.length}`);
