import { PARAMETERS } from '../src/constants.js';

export const NOW = Date.parse('2026-10-09T10:30:00Z');
export const RUN = '2026-10-09T10:00:00.000Z';
export const point = { key: '2:100000', name: 'Lausanne', latitude: 46.52, longitude: 6.63 };
export const silent = { info() {}, warn() {}, error() {}, debug() {} };
export function snapshot() {
  return {
    run: RUN,
    point,
    hours: Array.from({ length: 40 }, (_, i) => ({
      datetime: new Date(Date.parse('2026-10-09T10:00:00Z') + i * 3_600_000).toISOString(),
      temperature: 10 + i / 10,
      symbol: i < 8 ? 1 : 106,
      wind_speed: 36,
      wind_gust: 72,
      wind_direction: 270,
      precipitation: 2.54,
    })),
    days: Array.from({ length: 9 }, (_, i) => ({
      datetime: new Date(Date.parse('2026-10-08T22:00:00Z') + i * 86_400_000).toISOString(),
      temperature_min: 5,
      temperature_max: 15,
      symbol: 3,
      precipitation: 25.4,
    })),
  };
}
export function assets(stamp = '202610091000') {
  return Object.fromEntries(
    Object.keys(PARAMETERS).map((parameter) => [
      `vnut12.lssw.${stamp}.${parameter}.csv`,
      { href: `https://data.geo.admin.ch/${parameter}.csv` },
    ]),
  );
}
