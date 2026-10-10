import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('./data/warning-regions.json', import.meta.url)));
const polygons = data.regions.map(({ id, segments }) => {
  const ring = segments.flatMap((segment) => {
    const points = data.segments[Math.abs(segment) - 1];
    return segment < 0 ? [...points].reverse() : points;
  });
  return { id, ring };
});

// The same simplified WGS84 warning boundaries as the official hazard map.
// Include both neighbours on a boundary; never substitute a nearby postal point.
export function containsPoint(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j];
    const [bx, by] = ring[i];
    if (
      Math.abs((x - ax) * (by - ay) - (y - ay) * (bx - ax)) < 1e-12 &&
      x >= Math.min(ax, bx) &&
      x <= Math.max(ax, bx) &&
      y >= Math.min(ay, by) &&
      y <= Math.max(ay, by)
    )
      return true;
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

export function warningRegions(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
  return [
    ...new Set(
      polygons.filter(({ ring }) => containsPoint(ring, longitude, latitude)).map(({ id }) => id),
    ),
  ];
}
