# Internal maintenance guide

This guide is for maintainers and coding agents. Read [ARCHITECTURE.md](ARCHITECTURE.md) for data contracts and [RELEASING.md](RELEASING.md) before preparing a release. User instructions live in [en.md](en.md) and [fr.md](fr.md).

## Working on the code

1. Read `git status` and the relevant module and tests. Preserve unrelated changes.
2. Implement the change and add regression coverage for changed behavior. Keep user-facing strings in English and French.
3. Run `npm test`, `npm run check`, and `git diff --check`. Before a release, also run `npm audit --omit=dev`.
4. Update the user guides when behavior changes, the architecture guide when contracts change, and this guide or the release guide when maintenance procedures change.
5. Use English Conventional Commit subjects. Keep release titles and notes English only; the application and user guides remain bilingual.

Node.js 22 and 24 are tested in CI. Install locked dependencies with `npm ci --ignore-scripts`. Production runs on Node.js 24 Alpine, as the non-root `node` user, with writable persistent storage under `/data`.

## Finding the right module

| Area                                           | Implementation                                                       | Regression coverage                               |
| ---------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------- |
| Provider startup, status and refresh callbacks | `src/index.js`, `src/integration.js`                                 | `test/integration.test.js`, `test/scenes.test.js` |
| Discovery, ingestion, freshness and disk cache | `src/provider.js`                                                    | `test/provider.test.js`                           |
| HTTP, CSV streaming and locality resolution    | `src/http.js`, `src/locations.js`                                    | `test/http-locations.test.js`                     |
| Weather units, timestamps and conditions       | `src/forecast.js`, `src/constants.js`                                | `test/forecast.test.js`                           |
| Widgets and translations                       | `src/widgets.js`, `src/i18n.js`, manifest                            | `test/integration.test.js`                        |
| Scene thresholds, transitions and persistence  | `src/scenes.js`, manifest                                            | `test/scenes.test.js`                             |
| Official warning feed, geography and delivery  | `src/warnings.js`, `src/warning-regions.js`, `src/warning-scenes.js` | `test/warnings.test.js`                           |
| Versioning, changelog and GitHub release notes | `scripts/release.js`, release workflow                               | `test/release.test.js`                            |

## Contracts to preserve

- Published widget and trigger keys are stable identifiers. A renamed key breaks existing dashboards or scenes.
- Scene thresholds and forecast windows belong in each scene's trigger fields. They are predefined choices, not shared integration settings. The runtime evaluates each supported house/threshold/window combination because Gladys filters events by equality and does not send scene subscriptions to the integration.
- Update both `SCENE_RULES` / `SCENE_HORIZONS` and the manifest when changing scene choices. Keep required choices and defaults consistent. More choices increase event volume; preserve rate limiting, separate transition state and deferred reevaluation tests.
- A new scene does not replay a risk already reported for its combination. Missing or stale forecasts must not clear active risk state. Never turn absent data into zero.
- MeteoSwiss hourly timestamps mark the end of the preceding interval. The scene window includes the current interval. Preserve UTC timestamps and Swiss calendar handling, including DST.
- Source wind speeds are km/h; the metric Gladys pivot uses m/s. Scene gust thresholds use km/h. Do not compare unlike units.
- All parameters in a snapshot come from one complete model run. National files stream sequentially. Preserve download backoff, cancellation, freshness checks and the 20-locality tracking limit.
- Official warnings have an independent 60-second polling loop. Do not put them behind national forecast downloads or the 15-minute forecast check. Unavailable warning data must not become “no warnings”. Keep MeteoSwiss attribution and the independent-integration wording.
- Warning freshness means a successful index check within three minutes, not the age of the last changed bulletin: a quiet period may leave it unchanged for days. Enforce each warning's expiry before sending. Never restore an old warning feed on boot. A missing/stale feed preserves scene deduplication state.
- Only confirmed degrees 2–5 for the seven MeteoSwiss weather phenomena are supported. Exclude FOEN/SLF hazards, lake/airfield warnings and preliminary outlooks. Publish on receipt, including future onset times. Preserve descriptions in native weather data; use the source link instead of truncating oversized text.
- Official scene identity uses house coordinates, phenomenon, onset and minimum level, retaining the highest delivered degree. Only a new episode or escalation emits again. Reserve 50 attempts/minute for warnings separately from the 240 forecast attempts (290 combined, below the core's 300 limit). Deferred retries reevaluate current data; persist only acknowledged events.
- Route all native weather nudges through `integration.requestWeatherRefresh()`. It coalesces forecast/warning changes and sends a deferred nudge after 61 seconds when necessary. Direct official scene events do not wait for this timer.

## Persistence and diagnosis

`/data/forecasts.json` caches forecasts. `/data/scene-state.json` preserves active forecast combinations; `/data/warning-scene-state.json` preserves acknowledged official warning levels. Writes use temporary files and rename. An unwritable volume falls back to memory with a warning; scene deduplication then cannot survive a restart. Do not delete scene state as a routine repair: doing so may emit active risks again.

| Symptom                               | Check                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| First load takes time                 | National forecast files may take several minutes; inspect provider logs before restarting.                                |
| Unknown or missing locality           | Check house coordinates, Swiss coverage, postcode ambiguity and the tracking limit.                                       |
| Scenes remain silent                  | Confirm the house, threshold and window; check freshness and complete hourly data. The combination may already be active. |
| Events repeat after restart           | Check `/data` ownership, persistence and scene-state warnings.                                                            |
| Events are delayed across many houses | Check the 240-attempts/minute limit; deferred work reevaluates current forecasts after one minute.                        |
| Old or unavailable forecasts          | Check complete run discovery, HTTP errors and retry backoff; do not mask the failure with fabricated data.                |

Use integration/container logs for diagnosis. Do not publish tokens, credentials, personal house coordinates or raw configuration in issues or release notes.

## Dependencies and external services

The installed npm SDK is the runtime contract. `test/sdk-harness.js` substitutes I/O while exercising the actual SDK. Do not assume helpers from upstream GitHub `main` exist in the installed package.

For an SDK update, review its changelog and update the lockfile, the version guard in `scripts/check.js`, the public-install workflow, test harness and documented compatibility as needed. Refresh `test/fixtures/manifest.schema.json` from the official Gladys schema when using new manifest features; record the source/date and check `gladys_version` against the minimum supported core release.

`npm run smoke` is an optional live upstream check. It downloads national files for Lausanne, Zurich and Geneva; it is not part of routine offline tests and does not exercise a live Gladys scene. Use it when changing data ingestion or resolving an upstream issue, not repeatedly for documentation edits.

## Official warning source maintenance

The public hazard-map web product is not a documented, version-stable OGD API. The client checks `/product/output/versioned/active-versions.json` (`danger: v3`) and `/product/output/versions.json` (`versioned/danger/v3`), then downloads both immutable language files at `/product/output/versioned/danger/v3/version__<version>/{fr,en}/dangers.json`. Unsupported active formats fail closed instead of continuing on a retired feed. Respect Cache-Control, Age, ETag and Retry-After. Commit validators only after both files validate. HTTP failures retry at 1, 2, 4, then 5 minutes unless the server requests longer.

`src/data/warning-regions.json` contains the official map's simplified WGS84 geography: initially 491 polygons, shared signed segment references and MeteoSwiss region IDs. Coordinates are matched locally, never sent upstream. The map is regional, not cadastral precision; boundary points may match both neighbours. Do not substitute a nearest postal point.

When geography changes, inspect the official hazard-map component imports to find the current regions-only asset. Its initial URL and retrieval date are recorded in the data file. Run `node scripts/import-warning-regions.js https://www.meteosuisse.admin.ch/static/<asset>.<hash>.js`. The importer parses only geographic JSON; it never executes remote code. Review the data diff, representative region tests and NOTICE. Keep this compact generated file excluded from Prettier; do not copy unrelated website code or proprietary graphics.

For a light live check, instantiate `OfficialWarnings`, call `refresh()`, inspect `version`, `checkedAt`, `nextCheck` and `weatherAlerts({ latitude, longitude, language })`, then `stop()`. This downloads two small metadata files and two language files. If warnings disappear, check the active version, schema, cache headers, house coordinates, degree, expiry and preliminary status against the official map. Do not turn a source failure into an empty list.

An empty live feed proves retrieval and empty handling, not actual active-warning delivery. Synthetic tests exercise warnings, escalation, cancellation, failures and the SDK. Record this distinction in VALIDATION.md.

## Release maintenance

[RELEASING.md](RELEASING.md) is the publication runbook. Keep the release workflow, generator, tests and runbook aligned. A code or documentation change alone does not require immediate publication.

Release notes use English Conventional Commit subjects, semantic categories, commit links, author attribution and a full changelog link. Review the text for English: the generator does not translate commit messages. Preserve historical release artifacts unless correcting their notes is explicitly part of the task.

Record executed checks and material gaps in [VALIDATION.md](VALIDATION.md). Distinguish SDK tests, registry image checks and end-to-end testing on a real Gladys installation; one does not establish the others.
