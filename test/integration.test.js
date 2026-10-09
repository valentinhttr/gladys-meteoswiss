import test from 'node:test';
import assert from 'node:assert/strict';
import { createTestGladys } from './sdk-harness.js';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { registerIntegration } from '../src/integration.js';
import { forecastWidget } from '../src/widgets.js';
import { toWeather } from '../src/forecast.js';
import { translate, messages, ProviderError } from '../src/i18n.js';
import { WIDGET_KEYS } from '../src/constants.js';
import { snapshot, point, RUN, NOW, silent } from './helpers.js';

test('all widget payloads pass SDK validation in both languages and unit systems', () => {
  for (const units of ['metric', 'us']) {
    for (const language of ['en', 'fr']) {
      for (const key of WIDGET_KEYS) {
        const data = { weather: toWeather(snapshot(), units, NOW), point, run: RUN };
        const widget = forecastWidget(key, data, units, language);
        assert.deepEqual(validateWidgetContent(widget), []);
        assert.ok(
          widget.components[0].text.includes(language === 'fr' ? 'Météo Suisse' : 'MeteoSwiss'),
        );
        assert.equal(widget.components.find((c) => c.type === 'chart').series[0].points.length, 24);
      }
    }
  }
});

test('language variants and unknown languages have stable fallbacks', () => {
  assert.equal(translate(messages.name, 'fr-CH'), 'Météo Suisse');
  assert.equal(translate(messages.name, 'de'), 'MeteoSwiss');
});

test('SDK weather and widget handlers support multiple houses and translated failures', async () => {
  const gladys = createTestGladys({
    houses: [
      { id: '1', selector: 'home', name: 'Maison', latitude: 46.52, longitude: 6.63 },
      { id: '2', selector: 'other', name: 'Chalet', latitude: 46.5, longitude: 7.5 },
    ],
  });
  const calls = [];
  const provider = {
    track: async () => {},
    refresh: async () => {},
    stop: async () => {},
    get: async (options) => {
      calls.push(options);
      return { weather: toWeather(snapshot(), options.units, NOW), point, run: RUN };
    },
  };
  const integration = registerIntegration(gladys, provider, silent);
  try {
    await integration.warm();
    const ack = await gladys.fake.weatherGet({
      latitude: 46.52,
      longitude: 6.63,
      language: 'fr',
      units: 'metric',
    });
    assert.equal(ack.success, true);
    assert.equal(ack.data.weather.hours.length, 24);
    const widget = await gladys.fake.widgetGet('wind', {
      settings: { house: 'other' },
      language: 'en',
      units: 'us',
    });
    assert.equal(widget.success, true);
    assert.deepEqual(validateWidgetContent(widget.data.content), []);
    assert.equal(calls.at(-1).longitude, 7.5);
    const missing = await gladys.fake.widgetGet('temperature', { settings: { house: 'Missing' } });
    assert.deepEqual(missing.data.content.components[0].text, messages.noHouse);
    provider.get = async () => {
      throw new ProviderError('outside');
    };
    const failed = await gladys.fake.weatherGet({
      latitude: 0,
      longitude: 0,
      language: 'fr',
      units: 'metric',
    });
    assert.equal(failed.success, false);
    assert.equal(failed.error, messages.outside.fr);
    const failedWidget = await gladys.fake.widgetGet('temperature');
    assert.deepEqual(failedWidget.data.content.components[0].text, messages.outside);
  } finally {
    await integration.stop();
    await gladys.disconnect();
  }
});
