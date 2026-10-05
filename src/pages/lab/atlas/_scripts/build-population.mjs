// Builds _data/population.json — decennial census counts per state (present-day boundaries),
// from Wikipedia's compiled table of US Census Bureau figures.
// Run: node src/pages/lab/atlas/_scripts/build-population.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAGE = 'List_of_U.S._states_and_territories_by_historical_population';
const API = `https://en.wikipedia.org/w/api.php?action=parse&page=${PAGE}&prop=text&formatversion=2&format=json&redirects=1`;
const ABBR = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT',
  Delaware: 'DE', 'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL',
  Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD',
  Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT',
  Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA',
  'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT',
  Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
};
const clean = (s) => s.replace(/<sup[\s\S]*?<\/sup>/g, '').replace(/<[^>]+>/g, '').replace(/&#160;|&nbsp;/g, ' ').trim();

const res = await fetch(API, { headers: { 'user-agent': 'isaacdessert.dev atlas data build' } });
if (!res.ok) throw new Error(`Wikipedia API ${res.status}`);
const html = (await res.json()).parse.text;
const tables = [...html.matchAll(/<table class="(?:wikitable|sortable)[^"]*"[\s\S]*?<\/table>/g)].map((m) => m[0]);

const states = {};
const used = [];
for (const table of tables) {
  const rows = [...table.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((m) => m[0]);
  const heads = [...rows[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => clean(m[1]));
  const years = heads.filter((h) => /^\d{4}$/.test(h)).map(Number);
  // Use the three state tables: 1790–1860 (has an "Admitted" column), 1870–1950, 1960–2020.
  const wanted = (heads.includes('Admitted') && years[0] === 1790) || years[0] === 1870 || (years[0] === 1960 && years.at(-1) === 2020);
  if (heads[0] !== 'Name' || !wanted || years.some((y) => y % 10 !== 0)) continue;
  used.push(`${years[0]}–${years.at(-1)}`);
  for (const row of rows.slice(1)) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => clean(m[1]));
    const abbr = ABBR[cells[0]];
    if (!abbr) continue;
    heads.forEach((h, i) => {
      if (!/^\d{4}$/.test(h)) return;
      const v = parseInt((cells[i] ?? '').replace(/[^0-9]/g, ''), 10);
      if (Number.isFinite(v)) (states[abbr] ??= {})[h] = v;
    });
  }
}
if (used.length !== 3) throw new Error(`Expected 3 tables, used: ${used.join(', ')}`);
const missing = Object.values(ABBR).filter((a) => !states[a]);
if (missing.length) throw new Error(`Missing states: ${missing.join(', ')}`);

const out = {
  meta: {
    source: 'US Census Bureau decennial counts, as compiled in Wikipedia: List of U.S. states and territories by historical population',
    url: `https://en.wikipedia.org/wiki/${PAGE}`,
    retrieved: new Date().toISOString().slice(0, 10),
    boundaries: 'present-day state boundaries',
  },
  states,
};
writeFileSync(fileURLToPath(new URL('../_data/population.json', import.meta.url)), JSON.stringify(out, null, 1));
console.log(`population: ${Object.keys(states).length} rows from tables ${used.join(', ')}`);
