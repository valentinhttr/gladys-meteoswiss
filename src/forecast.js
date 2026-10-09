import { HOUR } from './constants.js';
import { ProviderError } from './i18n.js';

// Official symbol descriptions: MeteoSwiss/opendata-localforecast-demos/notebooks/icons/symbols.json.
// No proprietary MeteoSwiss graphics are distributed; Gladys renders its own icons.
const CONDITIONS = [
  'unknown',
  'clear',
  'partly-cloudy',
  'partly-cloudy',
  'cloud',
  'cloud',
  'rain',
  'sleet',
  'snow',
  'rain',
  'sleet',
  'snow',
  'thunderstorm',
  'thunderstorm',
  'rain',
  'sleet',
  'snow',
  'rain',
  'sleet',
  'snow',
  'rain',
  'sleet',
  'snow',
  'thunderstorm',
  'thunderstorm',
  'thunderstorm',
  'partly-cloudy',
  'fog',
  'fog',
  'rain',
  'snow',
  'sleet',
  'rain',
  'rain',
  'snow',
  'cloud',
  'thunderstorm',
  'thunderstorm',
  'thunderstorm',
  'thunderstorm',
  'thunderstorm',
  'thunderstorm',
  'thunderstorm',
];

export function condition(symbol) {
  const night = symbol >= 101 && symbol <= 142;
  const code = night ? symbol - 100 : symbol;
  if (!Number.isInteger(code) || code < 1 || code > 42) return { weather: 'unknown' };
  return { weather: CONDITIONS[code], is_day: !night };
}

export function parseDate(value) {
  if (!/^\d{12}$/.test(value)) throw new Error('Invalid forecast timestamp');
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:00.000Z`;
  if (!Number.isFinite(Date.parse(iso)) || new Date(iso).toISOString() !== iso) {
    throw new Error('Invalid forecast timestamp');
  }
  return iso;
}

export function swissDate(value) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zurich',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function convert(row, units) {
  const { symbol, ...result } = row;
  Object.assign(result, condition(symbol));
  for (const field of ['temperature', 'temperature_min', 'temperature_max']) {
    if (Number.isFinite(result[field]) && units === 'us') result[field] = result[field] * 1.8 + 32;
  }
  for (const field of ['wind_speed', 'wind_gust']) {
    if (Number.isFinite(result[field])) result[field] /= units === 'us' ? 1.609344 : 3.6;
  }
  if (Number.isFinite(result.precipitation) && units === 'us') result.precipitation /= 25.4;
  return result;
}

export function toWeather(snapshot, units = 'metric', now = Date.now()) {
  if (!['metric', 'us'].includes(units)) throw new Error('Unsupported units');
  // Never disguise forecasts from an old model run as live weather.
  if (
    !snapshot ||
    now - Date.parse(snapshot.run) > 6 * HOUR ||
    Date.parse(snapshot.run) > now + HOUR
  ) {
    throw new ProviderError('unavailable');
  }
  const hours = snapshot.hours
    .filter((row) => Number.isFinite(row.temperature))
    .sort((a, b) => a.datetime.localeCompare(b.datetime));
  // OGD hourly timestamps END the preceding hour. This interval contains now.
  const current = hours.find(
    (row) => Date.parse(row.datetime) > now && Date.parse(row.datetime) <= now + HOUR,
  );
  if (!current) throw new ProviderError('unavailable');
  const today = swissDate(now);
  const days = snapshot.days
    .filter(
      (row) =>
        Number.isFinite(row.temperature_min) &&
        Number.isFinite(row.temperature_max) &&
        swissDate(row.datetime) >= today,
    )
    .sort((a, b) => a.datetime.localeCompare(b.datetime))
    .slice(0, 8)
    .map((row) => {
      const day = convert(row, units);
      delete day.is_day;
      return day;
    });
  return {
    ...convert(current, units),
    // Preserve the forecast interval timestamp, rather than stamping the request time.
    hours: hours
      .filter((row) => Date.parse(row.datetime) > now)
      .slice(0, 24)
      .map((row) => convert(row, units)),
    days,
    // This collection contains no warnings. Omit alerts rather than asserting "no alerts".
  };
}
