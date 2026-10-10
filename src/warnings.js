import { warningRegions } from './warning-regions.js';

const ORIGIN = 'https://www.meteosuisse.admin.ch';
const INDEX = '/product/output/versions.json';
const ACTIVE_VERSIONS = '/product/output/versioned/active-versions.json';
const PRODUCT = 'versioned/danger/v3';
export const WARNING_POLL_MS = 60_000;
export const WARNING_FRESH_MS = 3 * WARNING_POLL_MS;
export const WARNING_URL = `${ORIGIN}/services-et-publications/applications/dangers.html`;
export const WARNING_TYPES = {
  wind: { en: 'Wind', fr: 'Vent', type: 'wind' },
  thunderstorm: { en: 'Thunderstorms', fr: 'Orages', type: 'thunderstorm' },
  rain: { en: 'Rain', fr: 'Pluie', type: 'rain' },
  snow: { en: 'Snow', fr: 'Neige', type: 'snow' },
  'slippery-roads': { en: 'Slippery roads', fr: 'Chaussées glissantes' },
  'heat-wave': { en: 'Heat wave', fr: 'Canicule', type: 'heat' },
  frost: { en: 'Frost', fr: 'Gel', type: 'cold' },
};

export function parseWarnings(data, now) {
  if (
    !data ||
    typeof data.hazards !== 'object' ||
    !data.hazards ||
    Array.isArray(data.hazards) ||
    data.config?.name !== 'dangers-map' ||
    !Number.isFinite(data.config.timestamp) ||
    data.config.timestamp * 1000 > now + 300_000
  )
    throw new Error('Invalid official warning product');
  const warnings = [];
  for (const type of Object.keys(WARNING_TYPES)) {
    const rows = data.hazards[type] ?? [];
    if (!Array.isArray(rows)) throw new Error('Invalid warning list');
    for (const row of rows) {
      if (
        row.warn_type !== type ||
        !Number.isInteger(row.warnlevel) ||
        row.warnlevel < 0 ||
        row.warnlevel > 5 ||
        !Array.isArray(row.areas) ||
        !row.areas.every(Number.isInteger) ||
        typeof row.is_outlook !== 'boolean' ||
        !Number.isFinite(row.onset) ||
        !Number.isFinite(new Date(row.onset * 1000).getTime()) ||
        !Number.isFinite(row.expires) ||
        !Number.isFinite(new Date(row.expires * 1000).getTime()) ||
        row.expires <= row.onset ||
        (row.description !== undefined && typeof row.description !== 'string')
      )
        throw new Error('Invalid official warning');
      // Outlooks are explicitly preliminary, not confirmed warnings. Other federal
      // hazards (SLF/FOEN), lakes and airfields are not MeteoSwiss house warnings.
      if (row.warnlevel >= 2 && !row.is_outlook && row.areas.length)
        warnings.push({ ...row, areas: [...row.areas] });
    }
  }
  return warnings;
}

function retryDelay(value, now) {
  if (!value) return 0;
  const seconds = Number(value);
  return Number.isFinite(seconds)
    ? Math.max(0, seconds * 1000)
    : Math.max(0, Date.parse(value) - now) || 0;
}

export class OfficialWarnings {
  constructor({
    fetchImpl = fetch,
    now = Date.now,
    logger = console,
    onUpdate = async () => {},
  } = {}) {
    Object.assign(this, { fetchImpl, now, logger, onUpdate });
    this.nextCheck = 0;
    this.failures = 0;
  }

  async request(path, headers = {}) {
    const response = await this.fetchImpl(`${ORIGIN}${path}`, {
      headers: { 'User-Agent': 'gladys-meteoswiss', ...headers },
      redirect: 'error',
      signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(15_000)]),
    });
    if (response.status !== 304 && !response.ok) {
      this.retryAfter = Math.max(
        this.retryAfter || 0,
        retryDelay(response.headers.get('retry-after'), this.now()),
      );
      throw new Error(`Official warnings HTTP ${response.status}`);
    }
    if (response.status === 304) return { response };
    // Bound the streamed body, including chunked responses.
    let size = 0;
    const chunks = [];
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 2_000_000) throw new Error('Official warning response too large');
      chunks.push(chunk);
    }
    return { response, data: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
  }

  refresh() {
    if (this.stopped) return Promise.resolve();
    if (this.pending) return this.pending;
    if (this.now() < this.nextCheck) return Promise.resolve();
    this.controller = new AbortController();
    this.pending = this.update()
      .catch((error) => {
        if (this.stopped) return;
        this.failures++;
        this.nextCheck =
          this.now() +
          Math.max(
            this.retryAfter || 0,
            Math.min(5 * WARNING_POLL_MS, WARNING_POLL_MS * 2 ** (this.failures - 1)),
          );
        this.logger.warn('Official warnings unavailable; retrying', { error: error.message });
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }

  async update() {
    this.retryAfter = 0;
    const indexes = await Promise.allSettled([
      this.request(INDEX, this.etag ? { 'If-None-Match': this.etag } : {}),
      this.request(ACTIVE_VERSIONS, this.activeEtag ? { 'If-None-Match': this.activeEtag } : {}),
    ]);
    const indexFailure = indexes.find((result) => result.status === 'rejected');
    if (indexFailure) throw indexFailure.reason;
    const { response, data } = indexes[0].value;
    const active = indexes[1].value;
    const activeVersion = active.response.status === 304 ? this.activeVersion : active.data?.danger;
    // Old versioned products can remain online after a website migration.
    // Never silently keep reporting from an abandoned v3 feed.
    if (activeVersion !== 'v3') throw new Error('Unsupported active official warning format');
    const version = response.status === 304 ? this.version : data?.[PRODUCT];
    if (typeof version !== 'string' || !/^(?:version__)?\d{8}_\d{4}$/.test(version))
      throw new Error('Missing supported official warning version');
    const cacheDelays = [response, active.response].map(({ headers }) => {
      const maxAge = Number(headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] ?? 60);
      const age = Number(headers.get('age') ?? 0);
      if (!Number.isFinite(maxAge) || !Number.isFinite(age) || maxAge > 86400 || age < 0)
        throw new Error('Unexpected warning cache duration');
      return (maxAge - age) * 1000;
    });
    if (version !== this.version || !this.bulletins) {
      const directory = version.startsWith('version__') ? version : `version__${version}`;
      const results = await Promise.allSettled(
        ['fr', 'en'].map(async (language) => {
          const { data: product } = await this.request(
            `/product/output/${PRODUCT}/${directory}/${language}/dangers.json`,
          );
          if (product.config?.language !== language) throw new Error('Unexpected warning language');
          return [language, parseWarnings(product, this.now())];
        }),
      );
      const failed = results.find((result) => result.status === 'rejected');
      if (failed) throw failed.reason;
      this.bulletins = Object.fromEntries(results.map((result) => result.value));
      this.version = version;
    }
    // Commit the index validator only after BOTH immutable language files validate.
    // Otherwise a subsequent 304 could hide a partially downloaded new version.
    this.etag = response.headers.get('etag') ?? (response.status === 304 ? this.etag : null);
    this.activeVersion = activeVersion;
    this.activeEtag =
      active.response.headers.get('etag') ??
      (active.response.status === 304 ? this.activeEtag : null);
    this.checkedAt = this.now();
    this.failures = 0;
    this.nextCheck = this.now() + Math.max(WARNING_POLL_MS, ...cacheDelays);
    if (!this.stopped) await this.onUpdate();
  }

  get({ latitude, longitude, language = 'en' }) {
    if (
      !this.bulletins ||
      this.checkedAt > this.now() ||
      this.now() - this.checkedAt > WARNING_FRESH_MS
    )
      return undefined;
    const regions = warningRegions(latitude, longitude);
    if (!regions.length) return undefined;
    const lang = language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
    return this.bulletins[lang].filter(
      (warning) =>
        warning.expires * 1000 > this.now() && warning.areas.some((area) => regions.includes(area)),
    );
  }

  weatherAlerts(options) {
    const warnings = this.get(options);
    if (!warnings) return undefined;
    const language = options.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
    return [...warnings]
      .sort((a, b) => b.warnlevel - a.warnlevel || a.onset - b.onset)
      .slice(0, 10)
      .map((warning) => ({
        severity: ['minor', 'moderate', 'severe', 'extreme'][warning.warnlevel - 2],
        event: `${WARNING_TYPES[warning.warn_type][language]} (${warning.warnlevel}/5) — MeteoSwiss`,
        ...(WARNING_TYPES[warning.warn_type].type
          ? { type: WARNING_TYPES[warning.warn_type].type }
          : {}),
        // Preserve the source text. Do not silently truncate a long official bulletin.
        description:
          warning.description && warning.description.length <= 4800
            ? `${warning.description}\nSource: MeteoSwiss\n${WARNING_URL}`
            : `Source: MeteoSwiss\n${WARNING_URL}`,
        start: new Date(warning.onset * 1000).toISOString(),
        end: new Date(warning.expires * 1000).toISOString(),
      }));
  }

  start() {
    if (this.started || this.stopped) return;
    this.started = true;
    const tick = async () => {
      await this.refresh();
      if (this.stopped) return;
      this.timer = setTimeout(tick, Math.max(1000, this.nextCheck - this.now()));
      this.timer.unref();
    };
    void tick();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.controller?.abort();
    await this.pending;
  }
}
