import { GladysIntegration } from '@gladysassistant/integration-sdk';
import { silent } from './helpers.js';

// SDK 0.14.0 on npm does not export /testing (GitHub main does).
// Exercise its actual command dispatch and ACK mapping, replacing only I/O.
export function createTestGladys({ houses = [] } = {}) {
  const gladys = new GladysIntegration({
    hostApiUrl: 'http://127.0.0.1:1443',
    token: 'test-only',
    selector: 'meteoswiss',
    logger: silent,
  });
  gladys.httpClient.get = async (path) => {
    if (path === '/house') return houses;
    throw new Error(`Unexpected host API path ${path}`);
  };
  let ack;
  gladys._send = (type, payload) => {
    if (type === 'external-integration.command-result') ack = payload;
  };
  async function command(type, payload) {
    ack = undefined;
    await gladys._handleMessage(
      JSON.stringify({
        type: `external-integration.${type}`,
        payload: { message_id: 'test', ...payload },
      }),
    );
    return ack;
  }
  gladys.fake = {
    weatherGet: (options) => command('weather.get', { options }),
    widgetGet: (key, options = {}) =>
      command('widget.get', {
        key,
        settings: {},
        language: 'en',
        units: 'metric',
        ...options,
      }),
  };
  return gladys;
}
