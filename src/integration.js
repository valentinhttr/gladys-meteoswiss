import { WIDGET_KEYS } from './constants.js';
import { coordinatesValid } from './locations.js';
import { messages, ProviderError, translate } from './i18n.js';
import { forecastWidget, messageWidget } from './widgets.js';
import { SceneTriggers } from './scenes.js';
import { WarningScenes } from './warning-scenes.js';

async function withinDeadline(operation) {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new ProviderError('loading')), 12_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function registerIntegration(gladys, provider, logger = console, warnings = null) {
  let houses = [];
  let housesLoaded = false;
  let stopped = false;
  let warming;
  let loadingHouses;
  let weatherRefreshTimer;
  let lastWeatherRefresh = -Infinity;
  let warningDigest;
  const now = provider.now ?? Date.now;
  const warningScenes = warnings
    ? new WarningScenes({
        gladys,
        warnings,
        cacheDir: provider.cacheDir,
        now,
        logger,
      })
    : null;
  // Gladys accepts only one weather-refresh nudge per minute. Coalesce forecast
  // and warning updates so an alert arriving after a forecast is not dropped.
  function requestWeatherRefresh() {
    if (stopped || !gladys.connected) return;
    clearTimeout(weatherRefreshTimer);
    const delay = Math.max(0, lastWeatherRefresh + 61_000 - now());
    if (delay) {
      weatherRefreshTimer = setTimeout(requestWeatherRefresh, delay);
      weatherRefreshTimer.unref();
    } else {
      lastWeatherRefresh = now();
      gladys.requestWeatherRefresh();
    }
  }
  function locatedHouses() {
    return houses.filter(
      (house) => house.selector && coordinatesValid(house.latitude, house.longitude),
    );
  }
  async function evaluateWarnings() {
    if (stopped || !housesLoaded || !warningScenes) return;
    const digest = JSON.stringify(
      locatedHouses().map((house) => [
        house.selector,
        warnings.weatherAlerts({ ...house, language: 'en' }),
        warnings.weatherAlerts({ ...house, language: 'fr' }),
      ]),
    );
    if (digest !== warningDigest) {
      warningDigest = digest;
      requestWeatherRefresh();
    }
    await warningScenes.evaluate(locatedHouses());
  }
  function loadHouses() {
    if (loadingHouses) return loadingHouses;
    loadingHouses = (async () => {
      const loaded = await gladys.getHouses();
      if (stopped) return;
      houses = loaded;
      housesLoaded = true;
      await evaluateWarnings();
    })()
      .catch((error) => logger.warn('Cannot refresh warning houses', { error: error.message }))
      .finally(() => {
        loadingHouses = null;
      });
    return loadingHouses;
  }
  const scenes = new SceneTriggers({
    gladys,
    getForecast: (house) => withinDeadline(provider.get({ ...house, units: 'metric' })),
    cacheDir: provider.cacheDir,
    now: provider.now,
    logger,
  });
  function evaluateScenes() {
    // An early refresh must not mistake an unloaded inventory for deleted houses.
    if (stopped || !housesLoaded) return Promise.resolve();
    return scenes.evaluate(locatedHouses());
  }
  async function warm() {
    if (warming) return warming;
    warming = (async () => {
      await loadHouses();
      for (const house of houses) {
        if (stopped) return;
        if (!coordinatesValid(house.latitude, house.longitude)) continue;
        try {
          await provider.track(house.latitude, house.longitude);
        } catch (error) {
          logger.warn('House outside forecast coverage or unavailable', { error: error.message });
        }
      }
      if (!stopped) {
        await provider.refresh();
        await evaluateScenes();
      }
    })()
      .catch((error) => logger.warn('Cannot preload houses', { error: error.message }))
      .finally(() => {
        warming = null;
      });
    return warming;
  }

  gladys.onWeatherGet(async (options) => {
    try {
      const weather = (await withinDeadline(provider.get(options))).weather;
      const alerts = warnings?.weatherAlerts(options);
      return alerts === undefined ? weather : { ...weather, alerts };
    } catch (error) {
      throw new Error(translate(messages[error.code] ?? messages.unavailable, options.language));
    }
  });

  for (const key of WIDGET_KEYS) {
    gladys.onWidgetGet(key, async ({ settings = {}, language = 'en', units = 'metric' }) => {
      const location = typeof settings.location === 'string' ? settings.location.trim() : '';
      const selected = typeof settings.house === 'string' ? settings.house.trim() : '';
      const candidates = selected
        ? houses.filter((house) => house.name === selected || house.selector === selected)
        : houses.filter((house) => coordinatesValid(house.latitude, house.longitude));
      // Do not silently display another house when a name is wrong or ambiguous.
      const house = selected ? (candidates.length === 1 ? candidates[0] : null) : candidates[0];
      if (!location && !house) return messageWidget(messages.noHouse);
      try {
        const result = await withinDeadline(
          provider.get(location ? { location, units } : { ...house, units }),
        );
        return forecastWidget(key, result, units, language);
      } catch (error) {
        return messageWidget(messages[error.code] ?? messages.unavailable);
      }
    });
  }
  function connected() {
    warningDigest = undefined;
    void loadHouses();
    void warnings?.refresh();
    void warm();
  }
  gladys.on('connected', connected);
  // A slow forecast download must not hold up changes to warning destinations.
  const houseTimer = warnings
    ? setInterval(() => {
        if (gladys.connected) void loadHouses();
      }, 60_000)
    : null;
  houseTimer?.unref();
  // Also notices changed house coordinates: Gladys has no house-update event.
  const timer = setInterval(() => {
    void warm();
  }, 15 * 60_000);
  timer.unref();
  return {
    warm,
    evaluateScenes,
    evaluateWarnings,
    requestWeatherRefresh,
    async stop() {
      stopped = true;
      clearInterval(timer);
      clearInterval(houseTimer);
      clearTimeout(weatherRefreshTimer);
      gladys.off('connected', connected);
      await Promise.all([scenes.stop(), warningScenes?.stop(), provider.stop(), warnings?.stop()]);
      await warming;
      await loadingHouses;
    },
  };
}
