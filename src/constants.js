export const COLLECTION = 'ch.meteoschweiz.ogd-local-forecasting';
export const STAC = `https://data.geo.admin.ch/api/stac/v1/collections/${COLLECTION}`;
export const POINTS_URL = `https://data.geo.admin.ch/${COLLECTION}/ogd-local-forecasting_meta_point.csv`;
export const HOUR = 3_600_000;
export const PARAMETERS = {
  tre200h0: { field: 'temperature', period: 'hours' },
  jww003i0: { field: 'symbol', period: 'hours' },
  rre150h0: { field: 'precipitation', period: 'hours' },
  fu3010h0: { field: 'wind_speed', period: 'hours' },
  fu3010h1: { field: 'wind_gust', period: 'hours' },
  dkl010h0: { field: 'wind_direction', period: 'hours' },
  tre200pn: { field: 'temperature_min', period: 'days' },
  tre200px: { field: 'temperature_max', period: 'days' },
  jp2000d0: { field: 'symbol', period: 'days' },
  rka150p0: { field: 'precipitation', period: 'days' },
};
export const WIDGET_KEYS = ['temperature', 'precipitation', 'wind'];
