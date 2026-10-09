import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverRun, downloadRun, MeteoSwissProvider } from '../src/provider.js';
import { PARAMETERS } from '../src/constants.js';
import { assets, snapshot, point, silent, NOW, RUN } from './helpers.js';

test('STAC pagination selects latest complete run, ignoring partial and future runs', async () => {
  let calls = 0;
  const pages = [
    {
      features: [
        {
          assets: {
            ...assets('202610090900'),
            'vnut12.lssw.202610091000.tre200h0.csv': { href: 'partial' },
          },
        },
      ],
      links: [{ rel: 'next', href: 'https://data.geo.admin.ch/page2' }],
    },
    { features: [{ assets: assets('202610091200') }], links: [] },
  ];
  const selected = await discoverRun({ json: async () => pages[calls++] }, NOW);
  assert.equal(selected.run, '2026-10-09T09:00:00.000Z');
  assert.equal(calls, 2);
  await assert.rejects(
    discoverRun({ json: async () => ({ features: [], links: [] }) }, NOW),
    /No complete/,
  );
});

test('STAC cyclic pagination terminates', async () => {
  await assert.rejects(
    discoverRun(
      {
        json: async () => ({
          features: [],
          links: [{ rel: 'next', href: 'https://data.geo.admin.ch/repeat' }],
        }),
      },
      NOW,
    ),
    /pagination/,
  );
});

function fixtureHttp({ fail = false } = {}) {
  const source = snapshot();
  return {
    json: async () => ({ features: [{ assets: assets() }], links: [] }),
    csv: async (url, row) => {
      if (fail) throw new Error('upstream unavailable');
      const parameter = url.split('/').at(-1).replace('.csv', '');
      const { field, period } = PARAMETERS[parameter];
      for (const item of source[period]) {
        const Date = item.datetime.replace(/[-:T]/g, '').slice(0, 12);
        row({ point_id: '100000', point_type_id: '1', Date, [parameter]: '999' });
        row({ point_id: '100000', point_type_id: '2', Date, [parameter]: String(item[field]) });
      }
    },
  };
}

test('stream filtering uses BOTH point IDs and joins parameters by timestamp', async () => {
  const run = await discoverRun(fixtureHttp(), NOW);
  const result = (await downloadRun(fixtureHttp(), run, [point])).get(point.key);
  assert.deepEqual(result, snapshot());
});

test('missing numeric data remains absent; zero is preserved', async () => {
  const run = await discoverRun(fixtureHttp(), NOW);
  const http = {
    csv: async (url, row) => {
      const parameter = url.split('/').at(-1).replace('.csv', '');
      for (const [Date, value] of [
        ['202610091100', ''],
        ['202610091200', '-999'],
        ['202610091300', '0'],
      ]) {
        row({ point_id: '100000', point_type_id: '2', Date, [parameter]: value });
      }
    },
  };
  const result = (await downloadRun(http, run, [point])).get(point.key);
  assert.equal(result.hours.length, 1);
  assert.equal(result.hours[0].temperature, 0);
});

test('refresh is deduplicated, persists atomically and restores without a download', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'meteoswiss-test-'));
  const provider = new MeteoSwissProvider({
    http: fixtureHttp(),
    cacheDir: dir,
    now: () => NOW,
    logger: silent,
  });
  provider.targets.set(point.key, point);
  try {
    const pending = provider.refresh();
    assert.equal(provider.refresh(), pending);
    await pending;
    assert.equal(provider.snapshots.get(point.key).run, RUN);
    const restored = new MeteoSwissProvider({ cacheDir: dir, now: () => NOW, logger: silent });
    await restored.restore();
    assert.deepEqual(restored.snapshots.get(point.key), snapshot());
    await restored.stop();
  } finally {
    await provider.stop();
    await rm(dir, { recursive: true });
  }
});

test('failed refresh retains previous data and backs off instead of retrying on each request', async () => {
  const provider = new MeteoSwissProvider({
    http: fixtureHttp({ fail: true }),
    cacheDir: null,
    now: () => NOW,
    logger: silent,
  });
  provider.targets.set(point.key, point);
  const old = { ...snapshot(), run: '2026-10-09T09:00:00.000Z' };
  provider.snapshots.set(point.key, old);
  await provider.refresh();
  assert.equal(provider.snapshots.get(point.key), old);
  assert.equal(provider.failures, 1);
  assert.ok(provider.nextCheck > NOW);
  await provider.refresh();
  assert.equal(provider.failures, 1);
  await provider.stop();
});

test('cold requests return loading immediately while refresh continues', async () => {
  const provider = new MeteoSwissProvider({
    http: fixtureHttp(),
    cacheDir: null,
    now: () => NOW,
    logger: silent,
  });
  provider.locations.nearest = async () => point;
  await assert.rejects(provider.get({ latitude: 46.52, longitude: 6.63 }), /loading/);
  await provider.pending;
  const result = await provider.get({ latitude: 46.52, longitude: 6.63 });
  assert.equal(result.weather.temperature, 10.1);
  await provider.stop();
});

test('custom locality and coordinates share the same forecast cache', async () => {
  const provider = new MeteoSwissProvider({
    http: fixtureHttp(),
    cacheDir: null,
    now: () => NOW,
    logger: silent,
  });
  const queries = [];
  provider.locations.find = async (query) => {
    queries.push(query);
    return point;
  };
  provider.locations.nearest = async () => point;
  await assert.rejects(provider.get({ location: 'Lausanne' }), /loading/);
  await provider.pending;
  const byName = await provider.get({ location: 'Lausanne' });
  const byHouse = await provider.get({ latitude: point.latitude, longitude: point.longitude });
  assert.deepEqual(byName, byHouse);
  assert.equal(provider.targets.size, 1);
  assert.deepEqual(queries, ['Lausanne', 'Lausanne']);
  provider.locations.find = async () => {
    throw new Error('unknownLocation');
  };
  await assert.rejects(
    provider.get({ location: 'typo', latitude: point.latitude, longitude: point.longitude }),
    /unknownLocation/,
  );
  await provider.stop();
});
