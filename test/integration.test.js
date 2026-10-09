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
        assert.equal(widget.components[0].text, point.name);
        assert.equal(widget.components[0].variant, 'heading');
        assert.equal(
          widget.components.some((c) => c.variant === 'caption'),
          false,
        );
        assert.equal(
          widget.components.some((c) => c.type === 'button'),
          false,
        );
        const chart = widget.components.find((c) => c.type === 'chart');
        assert.equal(chart.series[0].points.length, 24);
        // A caption would be moved above the chart by Gladys, regardless of array order.
        const footer = widget.components.at(-1);
        assert.equal(footer.variant, 'body');
        assert.ok(footer.text.startsWith(messages.source[language]));
        assert.ok(footer.text.includes(language === 'fr' ? 'heure suisse' : 'Swiss time'));
      }
    }
  }
});

test('long locality names stay within the Gladys heading limit', () => {
  const weather = toWeather(snapshot(), 'metric', NOW);
  const longName = { ...point, name: 'Une localité suisse avec un nom particulièrement long' };
  const content = forecastWidget(
    'temperature',
    { weather, point: longName, run: RUN },
    'metric',
    'en',
  );
  assert.equal(content.components[0].text, `${longName.name.slice(0, 39)}…`);
  assert.deepEqual(validateWidgetContent(content), []);
});

test('each widget may override the house, even without any located house', async () => {
  const gladys = createTestGladys();
  const calls = [];
  const provider = {
    track: async () => {},
    refresh: async () => {},
    stop: async () => {},
    get: async (options) => {
      calls.push(options);
      if (options.location === 'typo') throw new ProviderError('unknownLocation');
      return { weather: toWeather(snapshot(), options.units, NOW), point, run: RUN };
    },
  };
  const integration = registerIntegration(gladys, provider, silent);
  try {
    await integration.warm();
    for (const key of WIDGET_KEYS) {
      const ack = await gladys.fake.widgetGet(key, {
        settings: { location: ' Genève ', house: 'nonexistent' },
        language: 'fr',
        units: 'metric',
      });
      assert.equal(ack.success, true);
      assert.deepEqual(calls.at(-1), { location: 'Genève', units: 'metric' });
      assert.deepEqual(validateWidgetContent(ack.data.content), []);
    }
    const other = await gladys.fake.widgetGet('temperature', { settings: { location: '1202' } });
    assert.equal(other.success, true);
    assert.equal(calls.at(-1).location, '1202');
    const typo = await gladys.fake.widgetGet('temperature', { settings: { location: 'typo' } });
    assert.deepEqual(typo.data.content.components[0].text, messages.unknownLocation);
    const noLocation = await gladys.fake.widgetGet('temperature');
    assert.deepEqual(noLocation.data.content.components[0].text, messages.noHouse);
  } finally {
    await integration.stop();
    await gladys.disconnect();
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
    assert.equal(ack.data.weather.days.length, 8);
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
