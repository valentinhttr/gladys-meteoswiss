import { WIDGET_KEYS } from './constants.js';
import { coordinatesValid } from './locations.js';
import { messages, ProviderError, translate } from './i18n.js';
import { forecastWidget, messageWidget } from './widgets.js';
import { SceneTriggers } from './scenes.js';

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

export function registerIntegration(gladys, provider, logger = console) {
  let houses = [];
  let housesLoaded = false;
  let stopped = false;
  let warming;
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
    return scenes.evaluate(
      houses.filter((house) => house.selector && coordinatesValid(house.latitude, house.longitude)),
    );
  }
  async function warm() {
    if (warming) return warming;
    warming = (async () => {
      houses = await gladys.getHouses();
      housesLoaded = true;
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
      return (await withinDeadline(provider.get(options))).weather;
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
  gladys.on('connected', warm);
  // Also notices changed house coordinates: Gladys has no house-update event.
  const timer = setInterval(() => {
    void warm();
  }, 15 * 60_000);
  timer.unref();
  return {
    warm,
    evaluateScenes,
    async stop() {
      stopped = true;
      clearInterval(timer);
      gladys.off('connected', warm);
      await scenes.stop();
      await provider.stop();
      await warming;
    },
  };
}
