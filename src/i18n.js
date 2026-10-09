export const messages = {
  name: { en: 'MeteoSwiss', fr: 'Météo Suisse' },
  source: { en: 'Source: MeteoSwiss', fr: 'Source : Météo Suisse' },
  loading: {
    en: 'Downloading local forecasts. This first load may take a few minutes.',
    fr: 'Téléchargement des prévisions locales. Ce premier chargement peut prendre quelques minutes.',
  },
  unavailable: {
    en: 'MeteoSwiss forecasts are unavailable. Retrying automatically.',
    fr: 'Les prévisions Météo Suisse sont indisponibles. Une nouvelle tentative sera faite automatiquement.',
  },
  noHouse: {
    en: 'Enter a town or postcode in the widget settings, or set your house location in Gladys.',
    fr: 'Indiquez une ville ou un NPA dans les réglages du widget, ou localisez votre maison dans Gladys.',
  },
  unknownLocation: {
    en: 'Location not found. Enter its Swiss postcode or official town name, for example 1201 or Genève.',
    fr: 'Localité introuvable. Indiquez son NPA suisse ou son nom officiel, par exemple 1201 ou Genève.',
  },
  ambiguousLocation: {
    en: 'Several towns match. Enter both the postcode and town, for example 1201 Genève.',
    fr: 'Plusieurs localités correspondent. Indiquez le NPA et la ville, par exemple 1201 Genève.',
  },
  tooManyLocations: {
    en: 'The limit of 20 locations has been reached. Remove unused widgets and restart the integration.',
    fr: 'La limite de 20 localités est atteinte. Retirez les widgets inutilisés et redémarrez l’intégration.',
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
};

export const conditions = {
  clear: { en: 'Sunny', fr: 'Ensoleillé' },
  'partly-cloudy': { en: 'Partly cloudy', fr: 'Éclaircies' },
  cloud: { en: 'Cloudy', fr: 'Nuageux' },
  fog: { en: 'Fog', fr: 'Brouillard' },
  drizzle: { en: 'Drizzle', fr: 'Bruine' },
  rain: { en: 'Rain', fr: 'Pluie' },
  pouring: { en: 'Heavy rain', fr: 'Forte pluie' },
  sleet: { en: 'Rain and snow', fr: 'Pluie et neige' },
  hail: { en: 'Hail', fr: 'Grêle' },
  snow: { en: 'Snow', fr: 'Neige' },
  thunderstorm: { en: 'Thunderstorms', fr: 'Orages' },
  wind: { en: 'Windy', fr: 'Venteux' },
  unknown: { en: 'Unavailable', fr: 'Indisponible' },
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
