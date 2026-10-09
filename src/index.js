import { GladysIntegration, createLogger } from '@gladysassistant/integration-sdk';
import { MeteoSwissProvider } from './provider.js';
import { registerIntegration } from './integration.js';
import { WIDGET_KEYS } from './constants.js';
import { messages } from './i18n.js';

const logger = createLogger({ name: 'meteoswiss' });
const gladys = new GladysIntegration({ logger });
const provider = new MeteoSwissProvider({
  logger,
  onUpdate: async () => {
    await gladys.setConnectionStatus(true);
    gladys.requestWeatherRefresh();
    for (const key of WIDGET_KEYS) gladys.requestWidgetRefresh(key);
  },
  onError: () => gladys.setConnectionStatus(false, messages.unavailable),
});
const integration = registerIntegration(gladys, provider, logger);
gladys.handleShutdown(() => integration.stop());
await provider.restore();
provider.start();
await gladys.connect();
