// Import only the geographic dataset, never execute downloaded website code.
// Supply the regions-only JS asset referenced by the official hazard-map bundle.
import { mkdir, writeFile } from 'node:fs/promises';

const url = new URL(process.argv[2]);
if (
  url.origin !== 'https://www.meteosuisse.admin.ch' ||
  !/^\/static\/\d+\.[a-f0-9]+\.js$/.test(url.pathname) ||
  url.search ||
  url.hash
)
  throw new Error('Expected an official hazard-map regions asset URL');
const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const text = await response.text();
if (text.length > 2_000_000) throw new Error('Unexpected regions asset size');
const match = text.match(/JSON\.parse\('(\{"segments":.*)('\))/);
if (!match) throw new Error('Regions dataset not found');
const input = JSON.parse(match[1]);
const regions = Object.values(input.regions).map(({ properties, segments }) => ({
  id: Number(properties.METEO_REGION_ID),
  segments,
}));
if (
  regions.length < 400 ||
  regions.some(({ id, segments }) => !Number.isInteger(id) || !Array.isArray(segments))
)
  throw new Error('Unexpected warning regions');
await mkdir('src/data', { recursive: true });
await writeFile(
  'src/data/warning-regions.json',
  JSON.stringify({
    source: url.href,
    retrieved: new Date().toISOString().slice(0, 10),
    segments: input.segments,
    regions,
  }) + '\n',
);
console.log(
  `Imported ${regions.length} warning polygons. Review region tests and source attribution.`,
);
