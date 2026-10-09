import { POINTS_URL } from './constants.js';
import { ProviderError } from './i18n.js';

export function coordinatesValid(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function distanceKm(a, b) {
  const rad = (n) => (n * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export class Locations {
  constructor(http) {
    this.http = http;
  }

  async load() {
    if (this.points) return this.points;
    if (!this.pending) {
      this.pending = (async () => {
        const points = [];
        await this.http.csv(POINTS_URL, (row) => {
          // Postal localities avoid selecting a nearby mountain summit for a house in a valley.
          if (row.point_type_id !== '2') return;
          const latitude = Number(row.point_coordinates_wgs84_lat);
          const longitude = Number(row.point_coordinates_wgs84_lon);
          if (
            !row.point_coordinates_wgs84_lat ||
            !row.point_coordinates_wgs84_lon ||
            !coordinatesValid(latitude, longitude)
          )
            return;
          points.push({
            key: `2:${row.point_id}`,
            name: row.point_name,
            postalCode: row.postal_code,
            latitude,
            longitude,
          });
        });
        if (!points.length) throw new Error('No MeteoSwiss localities in metadata');
        this.points = points;
        return points;
      })().finally(() => {
        this.pending = null;
      });
    }
    return this.pending;
  }

  async nearest(latitude, longitude) {
    if (!coordinatesValid(latitude, longitude)) throw new ProviderError('noHouse');
    const points = await this.load();
    const target = { latitude, longitude };
    let nearest;
    let distance = Infinity;
    for (const point of points) {
      const km = distanceKm(target, point);
      if (km < distance) {
        nearest = point;
        distance = km;
      }
    }
    // Coverage is proximity-based, not a political boundary: documented for border homes.
    if (distance > 20) throw new ProviderError('outside');
    return nearest;
  }
}
