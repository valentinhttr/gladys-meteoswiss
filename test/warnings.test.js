import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  OfficialWarnings,
  parseWarnings,
  WARNING_FRESH_MS,
  WARNING_TYPES,
} from '../src/warnings.js';
import { warningRegions, containsPoint } from '../src/warning-regions.js';
import { WarningScenes } from '../src/warning-scenes.js';
import { registerIntegration } from '../src/integration.js';
import { createTestGladys } from './sdk-harness.js';
import { NOW, silent, snapshot, point, RUN } from './helpers.js';
import { toWeather } from '../src/forecast.js';

const house = { selector: 'home', name: 'Maison', latitude: 46.52, longitude: 6.63 };
const zurich = { selector: 'chalet', name: 'Chalet', latitude: 47.3769, longitude: 8.5417 };
const warning = (overrides = {}) => ({
  warn_type: 'wind',
  warnlevel: 3,
  areas: [225],
  is_outlook: false,
  onset: NOW / 1000 + 3600,
  expires: NOW / 1000 + 7200,
  description: 'Rafales de vent.',
  ...overrides,
});
function product(rows = [warning()], language = 'fr') {
  const hazards = {};
  for (const row of rows) (hazards[row.warn_type] ??= []).push(row);
  return {
    hazards,
    config: { name: 'dangers-map', timestamp: NOW / 1000, language, version: '2.0.0' },
  };
}
function response(data, headers = {}, status = 200) {
  return new Response(status === 304 ? null : JSON.stringify(data), { status, headers });
}
function setupFeed() {
  const state = { now: NOW, version: '20261009_1030', rows: [warning()], calls: [], updates: 0 };
  const feed = new OfficialWarnings({
    now: () => state.now,
    logger: silent,
    onUpdate: () => {
      state.updates++;
    },
    fetchImpl: async (url, options) => {
      state.calls.push({ url, options });
      if (url.endsWith('/active-versions.json')) {
        if (options.headers['If-None-Match'] === 'active' && !state.active)
          return response(null, {}, 304);
        return response({ danger: state.active ?? 'v3' }, { etag: 'active' });
      }
      if (state.fetch) return state.fetch(url, options);
      if (url.endsWith('/versions.json'))
        return response(
          { 'versioned/danger/v3': state.version },
          { etag: 'index', 'cache-control': 'max-age=60,public' },
        );
      return response(product(state.rows, url.includes('/fr/') ? 'fr' : 'en'));
    },
  });
  return { state, feed };
}
function setupScenes(feed, cacheDir) {
  const gladys = createTestGladys({ houses: [house] });
  gladys.connected = true;
  const events = [];
  gladys.httpClient.post = async (path, payload) => {
    assert.equal(path, '/scene/event');
    events.push(payload);
    return { success: true };
  };
  const scenes = new WarningScenes({
    gladys,
    warnings: feed,
    now: feed.now,
    cacheDir,
    logger: silent,
  });
  return { scenes, gladys, events };
}

test('official map regions match Swiss houses, reject outside points and include shared boundaries', () => {
  assert.deepEqual(warningRegions(house.latitude, house.longitude), [225]);
  assert.deepEqual(warningRegions(zurich.latitude, zurich.longitude), [132]);
  assert.deepEqual(warningRegions(46.2044, 6.1432), [222]);
  assert.deepEqual(warningRegions(46.948, 7.4474), [107]);
  for (const args of [
    [48.85, 2.35],
    [0, 0],
    [null, 6.63],
    [NaN, 6.63],
  ])
    assert.deepEqual(warningRegions(...args), []);
  const ring = [
    [0, 0],
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
    [0, 0],
  ];
  assert.equal(containsPoint(ring, 1, 0.5), true);
  assert.equal(containsPoint(ring, 0.5, 0.5), true);
  assert.equal(containsPoint(ring, 1.001, 0.5), false);
});

test('strict parsing distinguishes confirmed MeteoSwiss warnings from outlooks and other agencies', () => {
  const rows = Object.keys(WARNING_TYPES).map((type) => warning({ warn_type: type }));
  assert.equal(parseWarnings(product(rows), NOW).length, 7);
  assert.deepEqual(
    parseWarnings(
      product([
        warning({ is_outlook: true }),
        warning({ warnlevel: 1 }),
        warning({ warn_type: 'flood' }),
        warning({ warn_type: 'forestfire' }),
        warning({ warn_type: 'avalanches' }),
      ]),
      NOW,
    ),
    [],
  );
  for (const row of [
    warning({ warnlevel: 9 }),
    warning({ expires: 0 }),
    warning({ areas: ['225'] }),
    warning({ is_outlook: undefined }),
  ])
    assert.throws(() => parseWarnings(product([row]), NOW));
  for (const data of [
    {},
    { hazards: [] },
    { ...product(), config: { ...product().config, timestamp: NOW / 1000 + 301 } },
  ])
    assert.throws(() => parseWarnings(data, NOW));
});

test('polling starts immediately, coalesces calls, downloads only changed versions and revalidates via ETag', async () => {
  const { feed, state } = setupFeed();
  assert.equal(feed.get(house), undefined);
  await Promise.all([feed.refresh(), feed.refresh(), feed.refresh()]);
  assert.equal(state.calls.length, 4);
  assert.equal(feed.get(house).length, 1); // delivered BEFORE onset
  assert.deepEqual(feed.get(zurich), []);
  assert.equal(feed.get({ latitude: 0, longitude: 0 }), undefined);
  await feed.refresh();
  assert.equal(state.calls.length, 4);
  state.now += 60_000;
  state.fetch = (_url, options) => {
    assert.equal(options.headers['If-None-Match'], 'index');
    return response(null, { 'cache-control': 'max-age=60' }, 304);
  };
  await feed.refresh();
  assert.equal(state.calls.length, 6);
  assert.equal(state.updates, 2);
  state.now += WARNING_FRESH_MS + 1;
  assert.equal(feed.get(house), undefined);
  await feed.refresh();
  assert.equal(feed.get(house).length, 1);
  state.now = NOW + 7200_000;
  await feed.refresh();
  assert.deepEqual(feed.get(house), []); // expires even on unchanged feed
  await feed.stop();
});

test('new versions publish atomically; a failed language download is retried and cannot clear warnings', async () => {
  const { feed, state } = setupFeed();
  await feed.refresh();
  state.now += 60_000;
  state.version = '20261009_1031';
  state.fetch = (url) =>
    url.endsWith('versions.json')
      ? response({ 'versioned/danger/v3': state.version }, { etag: 'new' })
      : url.includes('/en/')
        ? response({}, {}, 503)
        : response(product([], 'fr'));
  await feed.refresh();
  assert.equal(feed.version, '20261009_1030');
  assert.equal(feed.etag, 'index');
  assert.equal(feed.get(house).length, 1);
  delete state.fetch;
  state.rows = [];
  state.now += 60_000;
  await feed.refresh();
  assert.equal(feed.version, state.version);
  assert.deepEqual(feed.get(house), []);
  await feed.stop();
});

test('cache headers, Retry-After, malformed versions and bounded bodies cannot cause a busy retry loop', async () => {
  const { feed, state } = setupFeed();
  state.fetch = () => response({}, { 'retry-after': '300' }, 429);
  await feed.refresh();
  assert.equal(feed.nextCheck, NOW + 300_000);
  state.now += 60_000;
  await feed.refresh();
  assert.equal(state.calls.length, 2);
  state.now = feed.nextCheck;
  state.fetch = () => response({ 'versioned/danger/v3': '../../elsewhere' });
  await feed.refresh();
  assert.equal(state.calls.length, 4);
  assert.equal(feed.get(house), undefined);
  state.now = feed.nextCheck;
  state.fetch = () => response({ huge: 'x'.repeat(2_000_001) });
  await feed.refresh();
  assert.equal(feed.get(house), undefined);
  state.now = feed.nextCheck;
  delete state.fetch;
  await feed.refresh();
  state.now = feed.nextCheck;
  state.fetch = () => response(null, { 'cache-control': 'max-age=600', age: '100' }, 304);
  await feed.refresh();
  assert.equal(feed.nextCheck, state.now + 500_000);
  await feed.stop();
});

test('shutdown aborts pending requests and the timer cannot restart', async () => {
  const { feed, state } = setupFeed();
  let signal;
  state.fetch = (_url, options) =>
    new Promise((_, reject) => {
      signal = options.signal;
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
  feed.start();
  feed.start();
  assert.equal(state.calls.length, 2);
  await feed.stop();
  assert.equal(signal.aborted, true);
  assert.equal(state.updates, 0);
  feed.start();
  await feed.refresh();
  assert.equal(state.calls.length, 2);
});

test('an upstream format migration or malformed index cannot keep a retired feed fresh', async () => {
  const { feed, state } = setupFeed();
  await feed.refresh();
  state.now += 60_000;
  state.active = 'v4';
  await feed.refresh();
  assert.equal(feed.checkedAt, NOW);
  state.now += WARNING_FRESH_MS;
  assert.equal(feed.get(house), undefined);
  delete state.active;
  state.fetch = () => response(null);
  await feed.refresh();
  assert.equal(feed.checkedAt, NOW);
  assert.equal(feed.get(house), undefined);
  await feed.stop();
});

test('a warning that expires during publishing does not send remaining threshold events', async (t) => {
  const { feed, state } = setupFeed();
  await feed.refresh();
  const { scenes, gladys, events } = setupScenes(feed);
  t.after(() => scenes.stop());
  gladys.httpClient.post = async (_path, payload) => {
    events.push(payload);
    state.now = warning().expires * 1000;
    return { success: true };
  };
  await scenes.evaluate([house]);
  assert.equal(events.length, 1);
  await feed.stop();
});

test('forecast and warning nudges are coalesced with a deferred refresh, and shutdown cancels it', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let now = NOW;
  const gladys = createTestGladys();
  gladys.connected = true;
  let nudges = 0;
  gladys.requestWeatherRefresh = () => {
    nudges++;
  };
  const provider = { now: () => now, stop: async () => {} };
  const integration = registerIntegration(gladys, provider, silent);
  t.after(() => integration.stop());
  integration.requestWeatherRefresh();
  assert.equal(nudges, 1);
  now += 5000;
  t.mock.timers.tick(5000);
  integration.requestWeatherRefresh();
  integration.requestWeatherRefresh();
  assert.equal(nudges, 1);
  now += 56000;
  t.mock.timers.tick(56000);
  assert.equal(nudges, 2);
  integration.requestWeatherRefresh();
  await integration.stop();
  now += 61000;
  t.mock.timers.tick(61000);
  assert.equal(nudges, 2);
});

test('scene filters match the manifest; new warnings and escalation fire once and survive restart', async (t) => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'meteoswiss-warning-'));
  t.after(() => rm(cacheDir, { recursive: true, force: true }));
  const { feed, state } = setupFeed();
  await feed.refresh();
  const first = setupScenes(feed, cacheDir);
  await Promise.all([first.scenes.evaluate([house, zurich]), first.scenes.evaluate([house])]);
  assert.equal(first.events.length, 2);
  const manifest = JSON.parse(
    await readFile(new URL('../gladys-assistant-integration.json', import.meta.url)),
  );
  const trigger = manifest.scene_triggers.find(({ key }) => key === 'official_warning');
  assert.equal(trigger.fields.find(({ key }) => key === 'minimum_level').default, '2');
  assert.deepEqual(
    trigger.fields.find(({ key }) => key === 'phenomenon').options.map(({ value }) => value),
    Object.keys(WARNING_TYPES),
  );
  for (const { data } of first.events) {
    for (const variable of trigger.variables)
      assert.equal(typeof data[variable.key], variable.type);
    for (const field of trigger.fields.filter(({ options }) => options))
      assert.ok(field.options.some(({ value }) => value === data[field.key]));
    assert.equal(data.house, house.selector);
    assert.equal(data.level, 3);
  }
  await first.scenes.stop();
  const second = setupScenes(feed, cacheDir);
  t.after(() => second.scenes.stop());
  await second.scenes.evaluate([house]);
  assert.equal(second.events.length, 0);
  state.now += 60_000;
  state.version = '20261009_1031';
  state.rows = [warning({ warnlevel: 4 })];
  await feed.refresh();
  await second.scenes.evaluate([house]);
  assert.equal(second.events.length, 3);
  state.now += 60_000;
  state.version = '20261009_1032';
  state.rows = [warning({ warnlevel: 2 })];
  await feed.refresh();
  await second.scenes.evaluate([house]);
  assert.equal(second.events.length, 3); // de-escalation is silent
  state.now += WARNING_FRESH_MS + 1;
  await second.scenes.evaluate([house]);
  assert.equal(second.scenes.active.size, 5); // stale data preserves state
  await feed.refresh();
  await second.scenes.evaluate([house]);
  assert.equal(second.events.length, 3);
  state.now += 60_000;
  state.version = '20261009_1033';
  state.rows = [];
  await feed.refresh();
  await second.scenes.evaluate([house]);
  assert.equal(second.scenes.active.size, 0);
  await feed.stop();
});

test('warning delivery retries failed acknowledgements and bounds bursts without stale queues', async (t) => {
  const { feed, state } = setupFeed();
  await feed.refresh();
  const { scenes, gladys, events } = setupScenes(feed);
  t.after(() => scenes.stop());
  let attempts = 0;
  gladys.httpClient.post = async () => {
    attempts++;
    throw new Error('offline');
  };
  await scenes.evaluate([house]);
  assert.equal(scenes.active.size, 0);
  assert.equal(attempts, 2);
  gladys.httpClient.post = async (_path, payload) => {
    events.push(payload);
    return { success: true };
  };
  const houses = Array.from({ length: 30 }, (_, i) => ({ ...house, selector: `house-${i}` }));
  await scenes.evaluate(houses);
  assert.equal(events.length, 48); // two failed attempts count against the budget
  state.now += 60_000;
  await feed.refresh();
  // Deferred retries read the latest destinations, not the old event queue.
  await scenes.evaluate([house]);
  assert.equal(events.length, 50);
  await scenes.evaluate([house]);
  assert.equal(events.length, 50);
  gladys.connected = false;
  await scenes.evaluate([zurich]);
  assert.equal(scenes.active.size, 2);
  await feed.stop();
});

test('corrupt warning state and moved houses never inherit an unrelated episode', async (t) => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'meteoswiss-warning-corrupt-'));
  t.after(() => rm(cacheDir, { recursive: true, force: true }));
  await writeFile(
    join(cacheDir, 'warning-scene-state.json'),
    JSON.stringify({ version: 1, active: ['bad-json', 'null', '{}'] }),
  );
  const { feed } = setupFeed();
  await feed.refresh();
  const { scenes, events } = setupScenes(feed, cacheDir);
  t.after(() => scenes.stop());
  await scenes.evaluate([house]);
  assert.equal(events.length, 2);
  await scenes.evaluate([{ ...house, longitude: house.longitude + 0.001 }]);
  assert.equal(events.length, 4);
  assert.equal(scenes.active.size, 2);
  await scenes.evaluate([]);
  assert.equal(scenes.active.size, 0);
  await feed.stop();
});

test('official scenes work while forecasts load; SDK weather includes alerts and preserves source text', async (t) => {
  const { feed } = setupFeed();
  await feed.refresh();
  const { gladys, events, scenes } = setupScenes(feed);
  await scenes.stop();
  let releaseForecast;
  let nudges = 0;
  gladys.requestWeatherRefresh = () => {
    nudges++;
  };
  const provider = {
    now: feed.now,
    track: async () => {},
    refresh: () =>
      new Promise((resolve) => {
        releaseForecast = resolve;
      }),
    stop: async () => {
      releaseForecast?.();
    },
    get: async () => ({ weather: toWeather(snapshot(), 'metric', NOW), point, run: RUN }),
  };
  const integration = registerIntegration(gladys, provider, silent, feed);
  t.after(() => integration.stop());
  const warming = integration.warm();
  // Wait until slow forecast refresh begins; warning events must already be sent.
  for (let i = 0; !releaseForecast && i < 50; i++) await new Promise(setImmediate);
  assert.equal(typeof releaseForecast, 'function');
  assert.equal(events.length, 2);
  assert.equal(nudges, 1);
  const ack = await gladys.fake.weatherGet({ ...house, language: 'fr', units: 'metric' });
  assert.equal(ack.success, true);
  assert.equal(ack.data.weather.alerts[0].type, 'wind');
  assert.equal(ack.data.weather.alerts[0].severity, 'moderate');
  assert.ok(ack.data.weather.alerts[0].description.startsWith(warning().description));
  releaseForecast();
  await warming;
});
