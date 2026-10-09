import test from 'node:test';
import assert from 'node:assert/strict';
import { condition, parseDate, swissDate, toWeather } from '../src/forecast.js';
import { snapshot, NOW } from './helpers.js';

test('all documented day/night symbols are mapped; invalid symbols stay unknown', () => {
  for (let i = 1; i <= 42; i++) {
    assert.notEqual(condition(i).weather, 'unknown');
    assert.equal(condition(i).is_day, true);
    assert.equal(condition(i + 100).weather, condition(i).weather);
    assert.equal(condition(i + 100).is_day, false);
  }
  for (const value of [0, -1, 43, 100, 143, 201, NaN, null, undefined, '1']) {
    assert.deepEqual(condition(value), { weather: 'unknown' });
  }
  assert.equal(condition(128).weather, 'fog');
  assert.equal(condition(107).weather, 'sleet');
  assert.equal(condition(142).weather, 'thunderstorm');
});

test('hourly intervals end at their timestamp; current forecast contains now', () => {
  const weather = toWeather(snapshot(), 'metric', NOW);
  assert.equal(weather.datetime, '2026-10-09T11:00:00.000Z');
  assert.equal(weather.temperature, 10.1);
  assert.equal(weather.wind_speed, 10);
  assert.equal(weather.wind_gust, 20);
  assert.equal(weather.precipitation, 2.54);
  assert.equal(weather.hours.length, 24);
  assert.equal(weather.days.length, 8);
  assert.equal(weather.days[0].datetime, '2026-10-08T22:00:00.000Z');
  assert.equal(weather.days[0].is_day, undefined);
  assert.equal(weather.alerts, undefined);
  assert.equal(weather.humidity, undefined);
});

test('US conversion applies to current, hourly and daily data without mutating cache', () => {
  const raw = snapshot();
  const copy = structuredClone(raw);
  const weather = toWeather(raw, 'us', NOW);
  assert.equal(weather.temperature, 50.18);
  assert.ok(Math.abs(weather.wind_speed - 22.3693629) < 0.00001);
  assert.equal(weather.precipitation, 0.1);
  assert.equal(weather.days[0].temperature_min, 41);
  assert.equal(weather.days[0].temperature_max, 59);
  assert.equal(weather.days[0].precipitation, 1);
  assert.deepEqual(raw, copy);
});

test('stale, missing and future runs fail instead of pretending to be current', () => {
  for (const run of ['2026-10-09T00:00:00Z', '2026-10-10T00:00:00Z']) {
    assert.throws(() => toWeather({ ...snapshot(), run }, 'metric', NOW), /unavailable/);
  }
  assert.throws(() => toWeather({ ...snapshot(), hours: [] }, 'metric', NOW), /unavailable/);
  assert.throws(() => toWeather(snapshot(), 'kelvin', NOW), /Unsupported/);
});

test('Swiss calendar dates handle midnight and both DST transitions', () => {
  assert.equal(swissDate('2026-03-28T23:00:00Z'), '2026-03-29');
  assert.equal(swissDate('2026-03-29T22:00:00Z'), '2026-03-30');
  assert.equal(swissDate('2026-10-24T22:00:00Z'), '2026-10-25');
  assert.equal(swissDate('2026-10-25T23:00:00Z'), '2026-10-26');
});

test('strict MeteoSwiss timestamps reject invalid calendar dates', () => {
  assert.equal(parseDate('202610091100'), '2026-10-09T11:00:00.000Z');
  for (const date of ['202602301100', '202613011100', '202601012400', '', 'garbage']) {
    assert.throws(() => parseDate(date), /Invalid/);
  }
});
