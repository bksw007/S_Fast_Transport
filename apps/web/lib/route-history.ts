export type RouteLocationRecord = {
  id: string;
  data: {
    lat?: unknown;
    lng?: unknown;
    accuracy?: unknown;
    speed?: unknown;
    timestamp?: unknown;
  };
};

export type RoutePoint = {
  id: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  recordedAt: number;
};

// A long sampling gap must not be represented as a road the driver actually used.
export const MAX_ROUTE_GAP_MS = 10 * 60 * 1000;
const MAX_PLAUSIBLE_SPEED_KMH = 160;

function distanceKm(from: RoutePoint, to: RoutePoint) {
  const radians = (value: number) => value * Math.PI / 180;
  const latDelta = radians(to.lat - from.lat);
  const lngDelta = radians(to.lng - from.lng);
  const haversine = Math.sin(latDelta / 2) ** 2
    + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(lngDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function buildRecordedRoute(records: RouteLocationRecord[]) {
  const points = records.flatMap(({ id, data }): RoutePoint[] => {
    const lat = data.lat;
    const lng = data.lng;
    const rawTime = data.timestamp;
    const recordedAt = typeof rawTime === "object" && rawTime !== null && "toMillis" in rawTime
      ? Number((rawTime as { toMillis: () => number }).toMillis())
      : typeof rawTime === "string" ? Date.parse(rawTime) : NaN;

    if (typeof lat !== "number" || typeof lng !== "number"
      || !Number.isFinite(lat) || !Number.isFinite(lng)
      || Math.abs(lat) > 90 || Math.abs(lng) > 180
      || (lat === 0 && lng === 0) || !Number.isFinite(recordedAt)) return [];

    const accuracy = Number(data.accuracy);
    const speed = Number(data.speed);
    return [{
      id, lat, lng, recordedAt,
      accuracy: data.accuracy == null || !Number.isFinite(accuracy) ? null : accuracy,
      speed: data.speed == null || !Number.isFinite(speed) ? null : speed
    }];
  }).sort((a, b) => a.recordedAt - b.recordedAt || a.id.localeCompare(b.id));

  const segments: RoutePoint[][] = [];
  const gaps: [RoutePoint, RoutePoint][] = [];
  for (const point of points) {
    const current = segments[segments.length - 1];
    const previous = current?.[current.length - 1];
    const elapsed = previous ? point.recordedAt - previous.recordedAt : 0;
    const implausibleJump = previous && (
      elapsed > 0
        ? distanceKm(previous, point) / (elapsed / 3_600_000) > MAX_PLAUSIBLE_SPEED_KMH
        : distanceKm(previous, point) > 0.2
    );
    if (!current || elapsed > MAX_ROUTE_GAP_MS || implausibleJump) {
      if (previous) gaps.push([previous, point]);
      segments.push([point]);
    } else {
      current.push(point);
    }
  }

  return { points, segments, gaps, gapCount: gaps.length };
}
