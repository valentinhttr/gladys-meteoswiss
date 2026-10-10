import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SCENE_HORIZONS, SCENE_RULES, SceneTriggers, evaluateForecast } from '../src/scenes.js';
import { toWeather } from '../src/forecast.js';
import { HOUR } from '../src/constants.js';
import { registerIntegration } from '../src/integration.js';
import { MeteoSwissProvider } from '../src/provider.js';
import { createTestGladys } from './sdk-harness.js';
import { NOW, assets, point, snapshot, silent } from './helpers.js';

const house = { selector: 'home', name: 'Maison', latitude: 46.52, longitude: 6.63 };
function calm() {
  const result = snapshot();
  result.hours.forEach((row) =>
    Object.assign(row, { temperature: 15, precipitation: 0, wind_gust: 10 }),
  );
  return result;
}
function setup({ cacheDir, config = {}, houses = [house] } = {}) {
  const gladys = createTestGladys({ houses });
  gladys.connected = true;
  gladys.config = config;
  const events = [];
  const allEvents = [];
  gladys.httpClient.post = async (path, payload) => {
    assert.equal(path, '/scene/event');
    allEvents.push(payload);
    const rule = SCENE_RULES.find((rule) => rule.key === payload.key);
    if (
      payload.data.threshold_choice === String(rule.default) &&
      payload.data.horizon_choice === '6'
    )
      events.push(payload);
    return { success: true };
  };
  const data = { snapshot: calm(), now: NOW };
  const getForecast = async () => ({
    weather: toWeather(data.snapshot, 'metric', data.now),
    point,
    run: data.snapshot.run,
  });
  const scenes = new SceneTriggers({
    gladys,
    cacheDir,
    getForecast,
    now: () => data.now,
    logger: silent,
  });
  return { gladys, events, allEvents, data, scenes, getForecast };
}

test('all four thresholds include equality and expose the first affected interval in metric units', () => {
  for (const rule of SCENE_RULES) {
    const weather = toWeather(calm(), 'metric', NOW);
    assert.equal(evaluateForecast(weather, rule, rule.default, 6, NOW), false);
    weather.hours[2][rule.field] = rule.default / rule.factor;
    assert.deepEqual(evaluateForecast(weather, rule, rule.default, 6, NOW), {
      forecast_at: weather.hours[2].datetime,
      value: rule.default,
    });
    weather.hours[2][rule.field] = (rule.default + (rule.below ? 0.01 : -0.01)) / rule.factor;
    assert.equal(evaluateForecast(weather, rule, rule.default, 6, NOW), false);
  }
});

test('windows include the current hour, exclude past and distant hours, and roll with time', () => {
  const rule = SCENE_RULES[0];
  const weather = toWeather(calm(), 'metric', NOW);
  weather.hours[3].precipitation = 1;
  assert.equal(evaluateForecast(weather, rule, 0.2, 3, NOW), false);
  assert.ok(evaluateForecast(weather, rule, 0.2, 3, NOW + HOUR));
  weather.hours[0].precipitation = 1;
  assert.ok(evaluateForecast(weather, rule, 0.2, 1, NOW));
  assert.equal(
    evaluateForecast(weather, rule, 0.2, 1, Date.parse(weather.hours[0].datetime)),
    false,
  );
});

test('missing, non-finite, duplicate and gapped data cannot announce or clear a risk', () => {
  const rule = SCENE_RULES[0];
  for (const mutate of [
    (rows) => rows.pop(),
    (rows) => delete rows[1].precipitation,
    (rows) => (rows[1].precipitation = NaN),
    (rows) => (rows[1] = { ...rows[0] }),
  ]) {
    const weather = toWeather(calm(), 'metric', NOW);
    weather.hours = weather.hours.slice(0, 3);
    weather.hours[0].precipitation = 2;
    mutate(weather.hours);
    assert.equal(evaluateForecast(weather, rule, 0.2, 3, NOW), null);
  }
});

test('actual SDK event payloads match manifest declarations and houses remain independent', async () => {
  const { scenes, data, events, allEvents } = setup();
  data.snapshot.hours[1].precipitation = 1;
  data.snapshot.hours[1].temperature = 0;
  data.snapshot.hours[2].temperature = 30;
  data.snapshot.hours[1].wind_gust = 50;
  const houses = [house, { ...house, selector: 'chalet', name: 'Chalet' }];
  await Promise.all([scenes.evaluate(houses), scenes.evaluate(houses), scenes.evaluate(houses)]);
  assert.equal(events.length, 8);
  const manifest = JSON.parse(
    await readFile(new URL('../gladys-assistant-integration.json', import.meta.url)),
  );
  for (const event of allEvents) {
    const declaration = manifest.scene_triggers.find((trigger) => trigger.key === event.key);
    assert.ok(declaration);
    assert.equal(declaration.fields[0].source, 'houses');
    for (const variable of declaration.variables)
      assert.equal(typeof event.data[variable.key], variable.type);
    for (const field of declaration.fields.filter((field) => field.options)) {
      assert.equal(field.required, true);
      assert.ok(field.options.some((option) => option.value === event.data[field.key]));
    }
    assert.equal(event.data.horizon_hours, Number(event.data.horizon_choice));
    assert.equal(event.data.threshold, Number(event.data.threshold_choice));
    assert.equal(event.data.location, 'Lausanne');
  }
  assert.equal(events.find((event) => event.key === 'gusts_expected').data.value, 50);
  assert.equal(events.filter((event) => event.data.house === 'chalet').length, 4);
});

test('one event per episode survives reconnect, updated runs and restart; a clear window rearms it', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'meteoswiss-scenes-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const first = setup({ cacheDir: dir });
  first.data.snapshot.hours[1].precipitation = 1;
  await first.scenes.evaluate([house]);
  first.gladys.connected = false;
  await first.scenes.evaluate([house]);
  first.gladys.connected = true;
  first.data.snapshot.run = '2026-10-09T10:15:00.000Z';
  await first.scenes.evaluate([house]);
  assert.equal(first.events.length, 1);
  await first.scenes.stop();
  const second = setup({ cacheDir: dir });
  second.data.snapshot = first.data.snapshot;
  await second.scenes.evaluate([house]);
  assert.equal(second.events.length, 0);
  second.data.snapshot = calm();
  await second.scenes.evaluate([house]);
  second.data.snapshot.hours[2].precipitation = 2;
  await second.scenes.evaluate([house]);
  assert.equal(second.events.length, 1);
});

test('stale and incomplete forecasts preserve an active episode and never publish', async () => {
  const { scenes, data, events } = setup();
  data.snapshot.hours[1].precipitation = 1;
  await scenes.evaluate([house]);
  data.snapshot = calm();
  delete data.snapshot.hours[2].precipitation;
  await scenes.evaluate([house]);
  data.snapshot.run = new Date(NOW - 7 * HOUR).toISOString();
  await scenes.evaluate([house]);
  data.snapshot = calm();
  data.snapshot.hours[1].precipitation = 1;
  await scenes.evaluate([house]);
  assert.equal(events.length, 1);
  const stale = setup();
  stale.data.snapshot = snapshot();
  stale.data.snapshot.run = new Date(NOW - 7 * HOUR).toISOString();
  await stale.scenes.evaluate([house]);
  assert.equal(stale.events.length, 0);
});

test('failed events retry later without blocking other risks or pretending they were delivered', async () => {
  const { gladys, scenes, data, events } = setup();
  data.snapshot = snapshot();
  const post = gladys.httpClient.post;
  gladys.httpClient.post = async (path, payload) => {
    if (payload.key === 'precipitation_expected') throw new Error('offline');
    return post(path, payload);
  };
  await scenes.evaluate([house]);
  assert.deepEqual(
    events.map((event) => event.key),
    ['gusts_expected'],
  );
  gladys.httpClient.post = post;
  await scenes.evaluate([house]);
  assert.deepEqual(
    events.map((event) => event.key),
    ['gusts_expected', 'precipitation_expected'],
  );
  await scenes.evaluate([house]);
  assert.equal(events.length, 2);
});

test('two scenes choose independent thresholds and windows, without integration settings', async () => {
  const { scenes, data, allEvents } = setup({ config: { scene_horizon: '1', scene_gusts: 200 } });
  const matches = (fields) =>
    allEvents.filter(
      (event) =>
        event.key === 'gusts_expected' &&
        Object.entries(fields).every(([key, value]) => event.data[key] === value),
    );
  const awning = { house: 'home', threshold_choice: '40', horizon_choice: '3' };
  const warning = { house: 'home', threshold_choice: '80', horizon_choice: '12' };
  data.snapshot.hours[2].wind_gust = 50;
  data.snapshot.hours[8].wind_gust = 70;
  await scenes.evaluate([house]);
  assert.equal(matches(awning).length, 1);
  assert.equal(matches(warning).length, 0);
  data.snapshot.hours[8].wind_gust = 80;
  await scenes.evaluate([house]);
  assert.equal(matches(awning).length, 1);
  assert.equal(matches(warning).length, 1);
  await scenes.evaluate([house]);
  assert.equal(matches(warning).length, 1);
  data.snapshot.hours[2].wind_gust = 10;
  await scenes.evaluate([house]);
  data.snapshot.hours[2].wind_gust = 40;
  await scenes.evaluate([house]);
  assert.equal(matches(awning).length, 2);
  assert.equal(matches(warning).length, 1);
});

test('manifest puts threshold and window choices in every scene and removes shared configuration', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../gladys-assistant-integration.json', import.meta.url)),
  );
  assert.equal(
    manifest.config_schema.some(
      (field) => field.key === 'scenes' || field.key.startsWith('scene_'),
    ),
    false,
  );
  for (const rule of SCENE_RULES) {
    const declaration = manifest.scene_triggers.find((trigger) => trigger.key === rule.key);
    const threshold = declaration.fields.find((field) => field.key === 'threshold_choice');
    const horizon = declaration.fields.find((field) => field.key === 'horizon_choice');
    assert.equal(threshold.required, true);
    assert.equal(horizon.required, true);
    assert.equal(threshold.default, String(rule.default));
    assert.equal(horizon.default, '6');
    assert.deepEqual(
      threshold.options.map((option) => Number(option.value)),
      rule.thresholds,
    );
    assert.deepEqual(
      horizon.options.map((option) => Number(option.value)),
      SCENE_HORIZONS,
    );
  }
});

test('removed houses and changed coordinates do not inherit old episodes', async () => {
  const { scenes, data, events } = setup();
  data.snapshot.hours[1].precipitation = 1;
  await scenes.evaluate([house]);
  await scenes.evaluate([{ ...house, longitude: 7 }]);
  assert.equal(events.length, 2);
  assert.ok(scenes.active.size > 0);
  assert.ok([...scenes.active].every((identity) => JSON.parse(identity)[2] === 7));
  await scenes.evaluate([]);
  assert.equal(scenes.active.size, 0);
});

test('corrupt or unwritable state cache does not prevent events or memory deduplication', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'meteoswiss-scenes-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'scene-state.json'), 'broken json');
  const restored = setup({ cacheDir: dir });
  restored.data.snapshot = snapshot();
  await restored.scenes.evaluate([house]);
  assert.equal(restored.events.length, 2);
  const blocked = join(dir, 'file');
  await writeFile(blocked, 'not a directory');
  const memory = setup({ cacheDir: blocked });
  memory.data.snapshot = snapshot();
  await memory.scenes.evaluate([house]);
  await memory.scenes.evaluate([house]);
  assert.equal(memory.events.length, 2);
});

test('shutdown suppresses pending evaluations', async () => {
  const { scenes, data, events } = setup();
  data.snapshot = snapshot();
  const pending = scenes.evaluate([house]);
  await scenes.stop();
  await pending;
  await scenes.evaluate([house]);
  assert.equal(events.length, 0);
});

test('integration preloads and evaluates houses without widgets; refresh callbacks reevaluate', async (t) => {
  const { gladys, data, events, getForecast } = setup({
    houses: [house, { selector: 'unlocated' }],
  });
  data.snapshot.hours[1].precipitation = 1;
  const calls = [];
  const provider = {
    now: () => NOW,
    track: async () => {},
    refresh: async () => {},
    stop: async () => {},
    get: async (options) => {
      calls.push(options);
      return getForecast();
    },
  };
  const integration = registerIntegration(gladys, provider, silent);
  t.after(() => integration.stop());
  await integration.warm();
  assert.equal(events.length, 1);
  assert.deepEqual(calls[0], { ...house, units: 'metric' });
  await integration.evaluateScenes();
  assert.equal(events.length, 1);
  data.snapshot.hours[1].precipitation = 0;
  await integration.evaluateScenes();
  data.snapshot.hours[1].precipitation = 3;
  await integration.evaluateScenes();
  assert.equal(events.length, 2);
  assert.equal(events[1].data.threshold, 0.2);
});

test('gust thresholds survive the km/h to m/s round trip at equality', () => {
  const weather = toWeather(calm(), 'metric', NOW);
  weather.hours[0].wind_gust = 61 / 3.6;
  assert.equal(evaluateForecast(weather, SCENE_RULES[3], 61, 1, NOW).value, 61);
});

test('refresh callbacks before the house inventory loads do not erase persisted episodes', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'meteoswiss-scenes-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const first = setup({ cacheDir: dir });
  first.data.snapshot = snapshot();
  await first.scenes.evaluate([house]);
  await first.scenes.stop();
  const { gladys, data, events, getForecast } = setup();
  data.snapshot = snapshot();
  const provider = {
    cacheDir: dir,
    now: () => NOW,
    track: async () => {},
    refresh: async () => {},
    stop: async () => {},
    get: getForecast,
  };
  const integration = registerIntegration(gladys, provider, silent);
  t.after(() => integration.stop());
  await integration.evaluateScenes();
  await integration.warm();
  assert.equal(events.length, 0);
});

test('provider refresh callbacks evaluate a rolling window even with the same model run', async (t) => {
  const { gladys, data, events } = setup();
  let integration;
  const provider = new MeteoSwissProvider({
    now: () => data.now,
    cacheDir: null,
    logger: silent,
    http: { json: async () => ({ features: [{ assets: assets() }], links: [] }) },
    onUpdate: () => integration.evaluateScenes(),
  });
  provider.locations.nearest = async () => point;
  data.snapshot.hours[7].precipitation = 1;
  provider.snapshots.set(point.key, data.snapshot);
  integration = registerIntegration(gladys, provider, silent);
  t.after(() => integration.stop());
  await integration.warm();
  assert.equal(events.length, 0);
  data.now += HOUR;
  await provider.refresh();
  assert.equal(events.length, 1);
  assert.equal(events[0].key, 'precipitation_expected');
  assert.equal(provider.failures, 0);
});

test('many houses stay below the host event limit and resume without duplicate transitions', async (t) => {
  const { scenes, data, allEvents } = setup();
  t.after(() => scenes.stop());
  const houses = Array.from({ length: 8 }, (_, i) => ({ ...house, selector: `house-${i}` }));
  data.snapshot.hours.forEach((row, i) =>
    Object.assign(row, { precipitation: 20, temperature: i % 2 ? -10 : 40, wind_gust: 120 }),
  );
  await scenes.evaluate(houses);
  assert.equal(allEvents.length, 240);
  assert.ok(scenes.retryTimer);
  await scenes.evaluate(houses);
  assert.equal(allEvents.length, 240);
  data.now += 60_000;
  await scenes.evaluate(houses);
  assert.equal(allEvents.length, 480);
  assert.equal(
    new Set(
      allEvents.map(({ key, data }) =>
        JSON.stringify([key, data.house, data.threshold_choice, data.horizon_choice]),
      ),
    ).size,
    480,
  );
  // Deferred transitions are reevaluated: a cleared risk is never sent from an old queue.
  data.snapshot = calm();
  data.now += 60_000;
  await scenes.evaluate(houses);
  assert.equal(allEvents.length, 480);
});
