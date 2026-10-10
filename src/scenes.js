import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { HOUR } from './constants.js';

export const SCENE_HORIZONS = [1, 3, 6, 12, 24];
const MAX_EVENTS_PER_MINUTE = 240;

export const SCENE_RULES = [
  {
    key: 'precipitation_expected',
    field: 'precipitation',
    default: 0.2,
    thresholds: [0.2, 1, 2, 5, 10],
    unit: 'mm',
    factor: 1,
  },
  {
    key: 'frost_expected',
    field: 'temperature',
    default: 0,
    thresholds: [-5, -2, 0, 2, 5],
    unit: '°C',
    factor: 1,
    below: true,
  },
  {
    key: 'heat_expected',
    field: 'temperature',
    default: 30,
    thresholds: [25, 28, 30, 32, 35],
    unit: '°C',
    factor: 1,
  },
  {
    key: 'gusts_expected',
    field: 'wind_gust',
    default: 50,
    thresholds: [30, 40, 50, 60, 80, 100],
    unit: 'km/h',
    factor: 3.6,
  },
];

// Hourly timestamps END the interval: include the current interval, never a past one.
export function evaluateForecast(weather, rule, threshold, horizon, now) {
  const first = Math.floor(now / HOUR) * HOUR + HOUR;
  const rows = weather.hours
    .filter((row) => {
      const time = Date.parse(row.datetime);
      return time >= first && time < first + horizon * HOUR;
    })
    .sort((a, b) => a.datetime.localeCompare(b.datetime));
  // Incomplete forecasts must neither announce nor clear a risk.
  if (
    rows.length !== horizon ||
    rows.some(
      (row, index) =>
        Date.parse(row.datetime) !== first + index * HOUR || !Number.isFinite(row[rule.field]),
    )
  )
    return null;
  const row = rows.find((row) => {
    const value = row[rule.field] * rule.factor;
    // A km/h → m/s → km/h round trip must not move a value below an equal threshold.
    const tolerance = Number.EPSILON * 4 * Math.max(1, Math.abs(value), Math.abs(threshold));
    return (value - threshold) * (rule.below ? -1 : 1) >= -tolerance;
  });
  return row
    ? { forecast_at: row.datetime, value: Number((row[rule.field] * rule.factor).toFixed(3)) }
    : false;
}

export class SceneTriggers {
  constructor({ gladys, getForecast, cacheDir = null, now = Date.now, logger = console }) {
    Object.assign(this, { gladys, getForecast, cacheDir, now, logger });
    this.active = new Set();
    this.dirty = false;
    this.sendTimes = [];
  }

  async restore() {
    if (!this.cacheDir) return;
    try {
      const raw = await readFile(join(this.cacheDir, 'scene-state.json'), 'utf8');
      if (raw.length > 1_000_000) throw new Error('Scene state too large');
      const state = JSON.parse(raw);
      if (state.version !== 1 || !Array.isArray(state.active))
        throw new Error('Invalid scene state');
      this.active = new Set(state.active.filter((key) => typeof key === 'string').slice(0, 10000));
    } catch (error) {
      if (error.code !== 'ENOENT')
        this.logger.warn('Scene state ignored', { error: error.message });
    }
  }

  async save() {
    if (!this.cacheDir || !this.dirty) return;
    try {
      await mkdir(this.cacheDir, { recursive: true });
      const path = join(this.cacheDir, 'scene-state.json');
      await writeFile(`${path}.tmp`, JSON.stringify({ version: 1, active: [...this.active] }), {
        mode: 0o600,
      });
      await rename(`${path}.tmp`, path);
      this.dirty = false;
    } catch (error) {
      this.logger.warn('Scene state kept in memory only', { error: error.message });
    }
  }

  evaluate(houses) {
    if (this.stopped) return Promise.resolve();
    this.latestHouses = houses;
    // Serialize refresh and reconnect callbacks; never publish a transition twice concurrently.
    this.pending = (this.pending ?? Promise.resolve())
      .then(() => this.run(houses))
      .catch((error) => {
        this.logger.warn('Cannot evaluate scene triggers', { error: error.message });
      });
    return this.pending;
  }

  async run(houses) {
    if (this.stopped || !this.gladys.connected) return;
    if (!this.restored) {
      await this.restore();
      this.restored = true;
    }
    let deferred = false;
    const retained = new Set();
    for (const house of houses) {
      if (this.stopped || !this.gladys.connected) return;
      // Gladys filters events by exact equality. Each supported choice has its own
      // transition state; a scene selects exactly one threshold and one horizon.
      const rules = SCENE_RULES.flatMap((rule) =>
        rule.thresholds.flatMap((threshold) =>
          SCENE_HORIZONS.map((horizon) => {
            const identity = JSON.stringify([
              house.selector,
              house.latitude,
              house.longitude,
              rule.key,
              threshold,
              horizon,
            ]);
            retained.add(identity);
            return { rule, threshold, horizon, identity };
          }),
        ),
      );
      try {
        const { weather, point, run } = await this.getForecast(house);
        const now = this.now();
        if (
          !Number.isFinite(Date.parse(run)) ||
          Date.parse(run) > now ||
          now - Date.parse(run) > 6 * HOUR
        )
          continue;
        for (const { rule, threshold, horizon, identity } of rules) {
          if (this.stopped || !this.gladys.connected) return;
          const event = evaluateForecast(weather, rule, threshold, horizon, now);
          if (event === null) continue;
          if (!event) {
            if (this.active.delete(identity)) this.dirty = true;
          } else if (!this.active.has(identity)) {
            const sentAt = this.now();
            this.sendTimes = this.sendTimes.filter((time) => time > sentAt - 60_000);
            if (this.sendTimes.length >= MAX_EVENTS_PER_MINUTE) {
              deferred = true;
              continue;
            }
            // Count attempts too, so errors cannot create a retry burst.
            this.sendTimes.push(sentAt);
            try {
              await this.gladys.publishSceneEvent(rule.key, {
                house: house.selector,
                house_name: house.name,
                location: point.name,
                ...event,
                unit: rule.unit,
                threshold,
                horizon_hours: horizon,
                threshold_choice: String(threshold),
                horizon_choice: String(horizon),
              });
              this.active.add(identity);
              this.dirty = true;
              await this.save();
            } catch (error) {
              this.logger.warn('Cannot publish forecast scene event', {
                key: rule.key,
                error: error.message,
              });
            }
          }
        }
      } catch (error) {
        this.logger.warn('Scene forecast unavailable', { error: error.message });
      }
    }
    for (const identity of this.active) {
      if (!retained.has(identity)) {
        this.active.delete(identity);
        this.dirty = true;
      }
    }
    await this.save();
    // Large multi-house installations may need several batches. Reevaluate fresh
    // forecasts on retry instead of queuing events which could become obsolete.
    if (deferred && !this.retryTimer && !this.stopped) {
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        void this.evaluate(this.latestHouses);
      }, 60_000);
      this.retryTimer.unref();
    }
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    await this.pending;
    await this.save();
  }
}
