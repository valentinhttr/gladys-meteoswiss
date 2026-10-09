import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { MeteoSwissProvider } from '../src/provider.js';
import { forecastWidget } from '../src/widgets.js';
import { WIDGET_KEYS } from '../src/constants.js';

// Explicit opt-in: this downloads national forecast files, not a single point API.
const provider = new MeteoSwissProvider({ cacheDir: process.env.DATA_DIR ?? null });
const started = Date.now();
try {
  await provider.track(46.5197, 6.6323); // Lausanne
  await provider.track(47.3769, 8.5417); // Zürich
  await provider.refresh();
  for (const [latitude, longitude] of [
    [46.5197, 6.6323],
    [47.3769, 8.5417],
  ]) {
    for (const units of ['metric', 'us']) {
      const result = await provider.get({ latitude, longitude, units });
      assert.equal(result.weather.hours.length, 24);
      assert.equal(result.weather.days.length, 8);
      for (const key of WIDGET_KEYS) {
        for (const language of ['fr', 'en']) {
          assert.deepEqual(validateWidgetContent(forecastWidget(key, result, units, language)), []);
        }
      }
      console.log(
        JSON.stringify({
          locality: result.point.name,
          run: result.run,
          units,
          temperature: result.weather.temperature,
          condition: result.weather.weather,
          hours: result.weather.hours.length,
          days: result.weather.days.length,
        }),
      );
    }
  }
  console.log(
    JSON.stringify({
      seconds: (Date.now() - started) / 1000,
      peakRssMiB: Math.round(process.resourceUsage().maxRSS / 1024),
    }),
  );
} finally {
  await provider.stop();
}
