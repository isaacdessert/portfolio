// Builds _data/borders.topo.json and _data/centroids.json from the Newberry Library's
// Atlas of Historical County Boundaries — US historical states & territories (CC BY-NC-SA 2.5).
// Run: node src/pages/lab/atlas/_scripts/build-borders.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mapshaper from 'mapshaper';
import { feature } from 'topojson-client';

const ZIP_URL = 'https://publications.newberry.org/ahcb/downloads/gis/US_AtlasHCB_StateTerr_Gen01.zip';
const DATA = fileURLToPath(new URL('../_data/', import.meta.url));
const SIMPLIFY = '15%'; // tune so borders.topo.json stays ≤ ~600 KB

const KIND = { State: 'state', Territory: 'territory', 'Unorganized Territory': 'territory' };
const day = (v) => String(v).slice(0, 10);

const tmp = mkdtempSync(path.join(tmpdir(), 'atlas-borders-'));
const zip = path.join(tmp, 'borders.zip');
const res = await fetch(ZIP_URL);
if (!res.ok) throw new Error(`Download failed: ${res.status}`);
writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
execFileSync('unzip', ['-q', zip, '-d', tmp]);
const shp = path.join(tmp, 'US_AtlasHCB_StateTerr_Gen01', 'US_HistStateTerr_Gen01_Shapefile', 'US_HistStateTerr_Gen01.shp');

// 1) clip to the western hemisphere box, simplify, add inner label points
const raw = path.join(tmp, 'raw.json');
await mapshaper.runCommands(
  `-i "${shp}" -clip bbox=-180,15,-60,72 -simplify ${SIMPLIFY} keep-shapes ` +
  `-each "lx=+this.innerX.toFixed(3), ly=+this.innerY.toFixed(3)" -o format=geojson precision=0.0001 "${raw}"`,
);

// 2) normalise properties
// Newberry's two District of Columbia records use the bare id "dc" (no "_type" suffix
// like every other record, e.g. "va_state", "dk_terr") — rewrite to "dc_district" so all
// ids share one {abbr}_{type} shape.
const fc = JSON.parse(readFileSync(raw, 'utf8'));
fc.features = fc.features.map((f) => {
  const p = f.properties;
  const end = day(p.END_DATE);
  const id = p.ID === 'dc' ? 'dc_district' : p.ID;
  return { ...f, properties: {
    id, name: p.NAME, kind: KIND[p.TERR_TYPE] ?? 'other',
    start: day(p.START_DATE), end: end === '2000-12-31' ? '9999-12-31' : end,
    lx: p.lx, ly: p.ly,
  } };
});
const clean = path.join(tmp, 'clean.json');
writeFileSync(clean, JSON.stringify(fc));

// 3) topology with shared arcs
const topoPath = path.join(DATA, 'borders.topo.json');
await mapshaper.runCommands(`-i "${clean}" -rename-layers borders -o format=topojson quantization=100000 "${topoPath}"`);
const topo = JSON.parse(readFileSync(topoPath, 'utf8'));
topo.metadata = {
  source: 'Atlas of Historical County Boundaries — US Historical States & Territories (Gen01)',
  url: 'https://publications.newberry.org/ahcb/',
  license: 'CC BY-NC-SA 2.5',
  attribution: 'Newberry Library, Atlas of Historical County Boundaries; simplified and reprojected for isaacdessert.dev',
};
writeFileSync(topoPath, JSON.stringify(topo));

// 4) label points of current states (+ DC) keyed by USPS abbreviation
const current = feature(topo, topo.objects.borders).features.filter((f) => f.properties.end === '9999-12-31');
const centroids = {};
for (const f of current) {
  if (f.properties.kind === 'state' || f.properties.id === 'dc_district') {
    centroids[f.properties.id.split('_')[0].toUpperCase()] = [f.properties.lx, f.properties.ly];
  }
}
writeFileSync(path.join(DATA, 'centroids.json'), JSON.stringify(centroids, null, 1));
console.log(`borders: ${topo.objects.borders.geometries.length} shapes; centroids: ${Object.keys(centroids).length}`);
