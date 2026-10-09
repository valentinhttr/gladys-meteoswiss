# MeteoSwiss for Gladys

[Documentation française](../README.md)

An independent **weather integration** for **Gladys Assistant 5.1.0+**, using the official JavaScript SDK pinned to **0.14.0** and official MeteoSwiss Open Data. No account or API key required. Not affiliated with MeteoSwiss.

## Features

- Native Gladys weather widget: forecast for the current hour, 24 hourly forecasts and 8 daily forecasts, day/night conditions, minimum/maximum temperature, precipitation, wind and gusts.
- Three additional widgets: temperature, precipitation and wind over 24 hours.
- French and English, multiple houses, metric and US units, Swiss calendar dates and DST handling.
- Streaming downloads, memory/disk cache, automatic retries and graceful shutdown.
- Versioned GitHub Releases, generated changelog and multiarchitecture Docker images.

Current conditions are **forecasts, not station observations**. This release does not provide official warnings, radar, humidity or pressure. Weather-alert scenes are not fed by this provider. Widgets use Gladys components and inherit its theme and responsive layout.

Gladys currently requires a single string for the manifest name. The catalog therefore displays **Météo Suisse / MeteoSwiss** in every language. Widget content uses **Météo Suisse** in French and **MeteoSwiss** in English. All descriptions, settings and messages are translated; unsupported languages fall back to English.

## Installation

The first release and Docker image must be published first; see [RELEASING.md](RELEASING.md).

1. Add `https://github.com/valentinhttr/gladys-meteoswiss` from Gladys external integrations.
2. Allow house-location access, used to preload forecasts and power the extra widgets.
3. Set your house coordinates in Gladys.
4. Add the native weather widget and select this provider if needed.
5. Add the integration widgets. The **House** setting accepts an exact house name or selector; leaving it empty uses the first located house. Unknown or ambiguous names display setup instructions.

Initial loading can take a few minutes. Extra widgets display a loading message, while native weather requests fail promptly so Gladys can fall back to another provider. Gladys is notified when forecasts become ready.

The nearest official postal locality is used, with a **20 km maximum distance**. Stations and mountain summits are excluded. This is proximity-based coverage, not a country boundary: some cross-border houses may receive forecasts for a nearby Swiss locality. Up to 20 distinct localities are tracked per process lifetime.

## Data and limits

**Source: MeteoSwiss.** [Official dataset documentation and terms](https://opendatadocs.meteoswiss.ch/e-forecast-data/e4-local-forecast-data).

The official STAC API distributes national CSV files per parameter, updated hourly. The integration checks every 15 minutes and streams ten files when a new complete model run is available or new locations need data. It retains only tracked localities. Downloads can total **several hundred MB per update**; use an unmetered connection. House coordinates are matched locally, not submitted to a third-party geocoder.

The cache at `/data/forecasts.json` contains locality and forecast data, never Gladys tokens. Data older than six hours from model issuance is refused. Failed refreshes retain usable cached data and retry with exponential delay and jitter.

Hourly timestamps mark the **end** of the interval. Precipitation totals include the current forecast hour and the following 23 hours. Weather symbols describe the preceding three-hour window. Daily dates use Europe/Zurich. Proprietary MeteoSwiss graphics are not distributed; codes are mapped to Gladys icons.

## Development and releases

```sh
npm ci
npm test
npm run check
# Optional real-network check; downloads national forecast files
npm run smoke
docker build -t gladys-meteoswiss:local .
```

Requires Node.js 22 or 24. Docker uses Node.js 24. Gladys supplies `GLADYS_HOST_API_URL`, `GLADYS_INTEGRATION_TOKEN` and `GLADYS_INTEGRATION_SELECTOR`. Use `DATA_DIR=.data` for local development before `npm start`.

See [release instructions](RELEASING.md) and [architecture](ARCHITECTURE.md). Tests validate the manifest, the actual npm SDK 0.14.0 command handling, widgets, conversions, caching, network failures and release preparation. A visual acceptance check in a real Gladys instance is still recommended before public distribution.

Code: [MIT](../LICENSE). Third-party notices: [NOTICE](../NOTICE).
