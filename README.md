# MeteoSwiss for Gladys

Swiss weather forecasts and official MeteoSwiss warnings for **Gladys Assistant 5.1+**, in English and French. No account or API key needed.

## Widgets

- **Temperature, precipitation and wind · 24 hours** — hourly charts.
- **Native Gladys weather widget** — daily forecasts for the next 8 days.

Each integration widget has its own **Location** setting. Enter a Swiss town or postcode, such as `Genève`, `1201` or `1201 Genève`. Leave it empty to use your house. You can display home, work and holiday locations on the same dashboard. The native Gladys weather widget keeps using its selected house.

## Scene triggers

Automate scenes when **precipitation, frost, high temperatures or strong gusts** appear in the forecast for your Gladys houses. Choose the house, threshold and forecast window directly in each scene trigger. Each scene has its own settings, selected from predefined values. By default: 0.2 mm in an hour, ≤ 0 °C, ≥ 30 °C and ≥ 50 km/h, within six hourly intervals including the current one.

Forecasts are checked every 15 minutes, even without widgets. Each risk fires once until a complete forecast window clears it; state is preserved across restarts when `/data` is writable. These events use forecasts, not official warnings. See the [user guide](docs/en.md#scene-triggers) for variables and behavior.

**Official MeteoSwiss warning** is a separate trigger. Choose the house, phenomenon and minimum danger level (2–5) directly in the scene. The official hazard-map feed is checked at startup and every **60 seconds**, independently of forecast downloads. New warnings and increases in danger level fire on receipt, including warnings for a future period. [Details and examples](docs/en.md#official-warnings).

## Install

1. In Gladys external integrations, add `https://github.com/valentinhttr/gladys-meteoswiss`.
2. Allow house-location access and add the widgets to your dashboard.
3. Set a **Location** per widget if needed. Allow a few minutes for the first download.

Forecast data is distributed as national files, so forecast refreshes can download several hundred MB. An unmetered connection is recommended. Warning checks use small separate JSON files. Radar is not provided.

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

[User guide](docs/en.md) · [Guide français](docs/fr.md) · [Maintenance](docs/MAINTENANCE.md) · [Releases](docs/RELEASING.md) · [Architecture](docs/ARCHITECTURE.md)
