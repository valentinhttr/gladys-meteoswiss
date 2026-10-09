import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { HOUR, PARAMETERS, STAC } from './constants.js';
import { Locations } from './locations.js';
import { OpenDataHttp } from './http.js';
import { parseDate, toWeather } from './forecast.js';
import { ProviderError } from './i18n.js';

export async function discoverRun(http, now = Date.now()) {
  const runs = new Map();
  let url = `${STAC}/items?limit=100`;
  const visited = new Set();
  while (url) {
    if (visited.has(url) || visited.size >= 10) throw new Error('Invalid STAC pagination');
    visited.add(url);
    const page = await http.json(url);
    if (!Array.isArray(page.features)) throw new Error('Invalid STAC items');
    for (const item of page.features) {
      for (const [key, asset] of Object.entries(item.assets ?? {})) {
        const match = /^vnut12\.lssw\.(\d{12})\.([a-z0-9]+)\.csv$/.exec(key);
        if (!match || !PARAMETERS[match[2]]) continue;
        const run = parseDate(match[1]);
        if (Date.parse(run) > now || now - Date.parse(run) > 6 * HOUR) continue;
        if (!runs.has(run)) runs.set(run, {});
        runs.get(run)[match[2]] = asset.href;
      }
    }
    url = page.links?.find((link) => link.rel === 'next')?.href;
  }
  // Publication is not atomic: use the latest COMPLETE model run, never mix runs.
  for (const run of [...runs.keys()].sort().reverse()) {
    const assets = runs.get(run);
    if (Object.keys(PARAMETERS).every((parameter) => typeof assets[parameter] === 'string')) {
      return { run, assets };
    }
  }
  throw new Error('No complete recent MeteoSwiss forecast run');
}

export async function downloadRun(http, { run, assets }, points) {
  const data = new Map(
    points.map((point) => [point.key, { point, hours: new Map(), days: new Map() }]),
  );
  // Sequential streaming bounds memory and avoids a burst of large national downloads.
  for (const [parameter, { field, period }] of Object.entries(PARAMETERS)) {
    await http.csv(assets[parameter], (row) => {
      const target = data.get(`${row.point_type_id}:${row.point_id}`);
      if (!target) return;
      const raw = row[parameter]?.trim();
      if (!raw || !Number.isFinite(Number(raw)) || Number(raw) <= -999) return;
      const datetime = parseDate(row.Date ?? row.date ?? row.time ?? row.Time);
      if (!target[period].has(datetime)) target[period].set(datetime, { datetime });
      target[period].get(datetime)[field] = Number(raw);
    });
  }
  return new Map(
    [...data].map(([key, value]) => [
      key,
      {
        run,
        point: value.point,
        hours: [...value.hours.values()],
        days: [...value.days.values()],
      },
    ]),
  );
}

export class MeteoSwissProvider {
  constructor({
    http,
    now = Date.now,
    cacheDir = process.env.DATA_DIR ?? '/data',
    logger = console,
    onUpdate = () => {},
    onError = () => {},
  } = {}) {
    this.abort = new AbortController();
    this.http = http ?? new OpenDataHttp({ signal: this.abort.signal });
    this.locations = new Locations(this.http);
    this.now = now;
    this.cacheDir = cacheDir;
    this.logger = logger;
    this.onUpdate = onUpdate;
    this.onError = onError;
    this.targets = new Map();
    this.snapshots = new Map();
    this.nextCheck = 0;
    this.failures = 0;
  }

  async restore() {
    if (!this.cacheDir) return;
    try {
      const raw = await readFile(join(this.cacheDir, 'forecasts.json'), 'utf8');
      if (raw.length > 5_000_000) throw new Error('Cache too large');
      const cache = JSON.parse(raw);
      if (cache.version !== 1 || !Array.isArray(cache.snapshots)) return;
      for (const snapshot of cache.snapshots.slice(0, 20)) {
        if (
          !/^2:\d+$/.test(snapshot.point?.key) ||
          !Array.isArray(snapshot.hours) ||
          !Array.isArray(snapshot.days) ||
          !Number.isFinite(Date.parse(snapshot.run))
        )
          continue;
        if (this.now() - Date.parse(snapshot.run) <= 6 * HOUR) {
          this.snapshots.set(snapshot.point.key, snapshot);
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT')
        this.logger.warn('Forecast cache ignored', { error: error.message });
    }
  }

  start() {
    this.timer = setInterval(() => {
      void this.refresh();
    }, 60_000);
    this.timer.unref();
  }

  async track(latitude, longitude) {
    const point = await this.locations.nearest(latitude, longitude);
    if (!this.targets.has(point.key)) {
      if (this.targets.size >= 20) throw new Error('Maximum 20 forecast localities');
      this.targets.set(point.key, point);
      if (!this.failures) this.nextCheck = 0;
    }
    return point;
  }

  async get({ latitude, longitude, units = 'metric' }) {
    const point = await this.track(latitude, longitude);
    void this.refresh();
    const snapshot = this.snapshots.get(point.key);
    if (!snapshot) throw new ProviderError(this.failures ? 'unavailable' : 'loading');
    return { weather: toWeather(snapshot, units, this.now()), point, run: snapshot.run };
  }

  refresh() {
    if (this.pending) return this.pending;
    if (this.abort.signal.aborted || !this.targets.size || this.now() < this.nextCheck) {
      return Promise.resolve();
    }
    this.pending = this.update()
      .catch(async (error) => {
        if (this.abort.signal.aborted) return;
        this.failures += 1;
        this.nextCheck =
          this.now() +
          Math.min(15 * 60_000, 60_000 * 2 ** Math.min(this.failures - 1, 4)) +
          Math.floor(Math.random() * 15_000);
        this.logger.warn('Forecast refresh failed; retry scheduled', { error: error.message });
        await this.onError(error);
      })
      .catch((error) => {
        this.logger.warn('Unable to report provider status', { error: error.message });
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }

  async update() {
    const selected = [...this.targets.values()];
    const run = await discoverRun(this.http, this.now());
    const missing = selected.filter((point) => this.snapshots.get(point.key)?.run !== run.run);
    if (missing.length) {
      const snapshots = await downloadRun(this.http, run, missing);
      // Validate the entire batch before replacing any last-known-good cache entry.
      for (const snapshot of snapshots.values()) {
        const weather = toWeather(snapshot, 'metric', this.now());
        if (!weather.days.length) throw new Error('Daily forecast is incomplete');
      }
      for (const [key, snapshot] of snapshots) this.snapshots.set(key, snapshot);
      if (this.cacheDir) {
        try {
          await mkdir(this.cacheDir, { recursive: true });
          const path = join(this.cacheDir, 'forecasts.json');
          await writeFile(
            `${path}.tmp`,
            JSON.stringify({ version: 1, snapshots: [...this.snapshots.values()] }),
            { mode: 0o600 },
          );
          await rename(`${path}.tmp`, path);
        } catch (error) {
          this.logger.warn('Forecasts ready; disk cache unavailable', { error: error.message });
        }
      }
    }
    this.failures = 0;
    this.nextCheck = this.now() + 15 * 60_000;
    if ([...this.targets.keys()].some((key) => !this.snapshots.has(key))) this.nextCheck = 0;
    await this.onUpdate();
  }

  async stop() {
    clearInterval(this.timer);
    this.abort.abort();
    await this.pending;
  }
}
