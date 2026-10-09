import { messages, translate } from './i18n.js';

export function messageWidget(message) {
  return { ttl_seconds: 30, components: [{ type: 'text', variant: 'body', text: message }] };
}

export function forecastWidget(key, { weather, point, run }, units, language) {
  const locale = language?.toLowerCase().startsWith('fr') ? 'fr-CH' : 'en-GB';
  const heading = point.name;
  const updated = new Intl.DateTimeFormat(locale, {
    timeZone: 'Europe/Zurich',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(run));
  const header = [
    {
      type: 'text',
      variant: 'heading',
      text: heading.length > 40 ? `${heading.slice(0, 39)}…` : heading,
    },
    {
      type: 'text',
      variant: 'caption',
      text: `${translate(messages.source, language)} · ${updated} · ${locale === 'fr-CH' ? 'Prévision · heure suisse' : 'Forecast · Swiss time'}`,
    },
  ];
  const hours = weather.hours;
  const fields = key === 'wind' ? ['wind_speed', 'wind_gust'] : [key];
  const labels = {
    temperature: messages.temperature,
    precipitation: messages.precipitation,
    wind_speed: messages.wind,
    wind_gust: messages.gusts,
  };
  const unit =
    key === 'temperature'
      ? units === 'us'
        ? '°F'
        : '°C'
      : key === 'precipitation'
        ? units === 'us'
          ? 'in'
          : 'mm'
        : units === 'us'
          ? 'mph'
          : 'm/s';
  const series = fields
    .map((field) => ({
      name: labels[field],
      points: hours
        .filter((hour) => Number.isFinite(hour[field]))
        .map((hour) => ({ t: hour.datetime, v: hour[field] })),
    }))
    .filter((entry) => entry.points.length);
  if (!series.length) return messageWidget(messages.unavailable);
  const values = series[0].points.map((point) => point.v);
  const tile = (value, label) => ({
    type: 'value',
    value: Math.round(value * 100) / 100,
    unit,
    label,
  });
  const tiles =
    key === 'precipitation'
      ? [
          tile(
            values.reduce((a, b) => a + b, 0),
            messages.total,
          ),
        ]
      : [tile(Math.min(...values), messages.minimum), tile(Math.max(...values), messages.maximum)];
  return {
    ttl_seconds: 300,
    components: [
      ...header,
      ...tiles,
      {
        type: 'chart',
        chart_type: key === 'precipitation' ? 'bar' : 'line',
        unit,
        title: messages.total,
        series,
      },
    ],
  };
}
