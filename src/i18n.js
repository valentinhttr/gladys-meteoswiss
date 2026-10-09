export const messages = {
  name: { en: 'MeteoSwiss', fr: 'Météo Suisse' },
  source: { en: 'Source: MeteoSwiss', fr: 'Source : MétéoSuisse' },
  loading: {
    en: 'Downloading local forecasts. This first load may take a few minutes.',
    fr: 'Téléchargement des prévisions locales. Ce premier chargement peut prendre quelques minutes.',
  },
  unavailable: {
    en: 'MeteoSwiss forecasts are unavailable. Retrying automatically.',
    fr: 'Les prévisions Météo Suisse sont indisponibles. Une nouvelle tentative sera faite automatiquement.',
  },
  noHouse: {
    en: 'Set your house location in Gladys, then select its name in the widget settings.',
    fr: 'Localisez votre maison dans Gladys, puis indiquez son nom dans les réglages du widget.',
  },
  outside: {
    en: 'No nearby Swiss forecast location. Check the house coordinates.',
    fr: 'Aucune localité de prévision suisse à proximité. Vérifiez les coordonnées de la maison.',
  },
  temperature: { en: 'Temperature', fr: 'Température' },
  precipitation: { en: 'Precipitation', fr: 'Précipitations' },
  wind: { en: 'Wind', fr: 'Vent' },
  gusts: { en: 'Gusts', fr: 'Rafales' },
  total: { en: 'Next 24 hours', fr: 'Prochaines 24 heures' },
  maximum: { en: 'Maximum', fr: 'Maximum' },
  minimum: { en: 'Minimum', fr: 'Minimum' },
  forecast: { en: 'Forecast, not an observation', fr: 'Prévision, pas une observation' },
  open: { en: 'MeteoSwiss website', fr: 'Site Météo Suisse' },
};

export function translate(value, language = 'en') {
  return value[language.toLowerCase().split(/[-_]/)[0]] ?? value.en;
}

export class ProviderError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
