import { GladysIntegration, createLogger } from '@gladysassistant/integration-sdk';
import { MeteoSwissProvider } from './provider.js';
import { registerIntegration } from './integration.js';
import { WIDGET_KEYS } from './constants.js';
import { messages } from './i18n.js';
import { OfficialWarnings } from './warnings.js';

const logger = createLogger({ name: 'meteoswiss' });
const gladys = new GladysIntegration({ logger });
const provider = new MeteoSwissProvider({
  logger,
  onUpdate: async () => {
    await gladys.setConnectionStatus(true);
    integration.requestWeatherRefresh();
    for (const key of WIDGET_KEYS) gladys.requestWidgetRefresh(key);
    await integration.evaluateScenes();
  },
  onError: () => gladys.setConnectionStatus(false, messages.unavailable),
});
const warnings = new OfficialWarnings({ logger, onUpdate: () => integration.evaluateWarnings() });
const integration = registerIntegration(gladys, provider, logger, warnings);
gladys.handleShutdown(() => integration.stop());
await provider.restore();
warnings.start();
provider.start();
await gladys.connect();
