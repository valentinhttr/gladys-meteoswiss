# MeteoSwiss for Gladys

Swiss weather forecasts for **Gladys Assistant 5.1+**, in English and French. No account or API key needed.

## Widgets

- **Temperature, precipitation and wind · 24 hours** — hourly charts.
- **Native Gladys weather widget** — daily forecasts for the next 8 days.

Each integration widget has its own **Location** setting. Enter a Swiss town or postcode, such as `Genève`, `1201` or `1201 Genève`. Leave it empty to use your house. You can display home, work and holiday locations on the same dashboard. The native Gladys weather widget keeps using its selected house.

## Install

1. In Gladys external integrations, add `https://github.com/valentinhttr/gladys-meteoswiss`.
2. Allow house-location access and add the widgets to your dashboard.
3. Set a **Location** per widget if needed. Allow a few minutes for the first download.

Forecasts only; no official warnings or radar. The official data is distributed as national files, so refreshes can download several hundred MB. An unmetered connection is recommended.

## Credits & disclaimer

**Source: [Météo Suisse (MeteoSwiss)](https://www.meteosuisse.admin.ch)** — [Open Data and terms](https://opendatadocs.meteoswiss.ch/e-forecast-data/e4-local-forecast-data).

This is an independent community integration. It is **not an official service** and is **not affiliated with, endorsed by or connected to Météo Suisse (MeteoSwiss)**. MeteoSwiss supplies the public weather data only.

## Development

Node.js 22/24 · Gladys SDK **0.14.0** · [MIT](LICENSE).

```sh
npm ci
npm test
npm run check
```

[User guide](docs/en.md) · [Guide français](docs/fr.md) · [Releases](docs/RELEASING.md) · [Architecture](docs/ARCHITECTURE.md)
