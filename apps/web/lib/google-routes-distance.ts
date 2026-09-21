export type RouteCoordinate = { lat: number; lng: number };

const GOOGLE_ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

export function validRouteCoordinate(point: unknown): point is RouteCoordinate {
  if (!point || typeof point !== "object") return false;
  const candidate = point as Record<string, unknown>;
  return typeof candidate.lat === "number"
    && typeof candidate.lng === "number"
    && Number.isFinite(candidate.lat)
    && Number.isFinite(candidate.lng)
    && Math.abs(candidate.lat) <= 90
    && Math.abs(candidate.lng) <= 180
    && (candidate.lat !== 0 || candidate.lng !== 0);
}

export function coordinateFingerprint(origin: unknown, destination: unknown) {
  if (!validRouteCoordinate(origin) || !validRouteCoordinate(destination)) return null;
  return `${origin.lat.toFixed(6)},${origin.lng.toFixed(6)}>${destination.lat.toFixed(6)},${destination.lng.toFixed(6)}`;
}

type FetchResponse = { ok: boolean; status?: number; json: () => Promise<unknown> };
type Fetcher = (url: string, options: RequestInit) => Promise<FetchResponse>;

export async function requestGoogleRouteDistance(
  origin: RouteCoordinate,
  destination: RouteCoordinate,
  apiKey: string,
  fetcher: Fetcher = fetch
) {
  if (!validRouteCoordinate(origin) || !validRouteCoordinate(destination)) throw new Error("พิกัดเส้นทางไม่ถูกต้อง");
  if (!apiKey.trim()) throw new Error("Google Routes API key is not configured");

  const response = await fetcher(GOOGLE_ROUTES_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.distanceMeters"
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
      units: "METRIC"
    }),
    ...(typeof AbortSignal !== "undefined" ? { signal: AbortSignal.timeout(8_000) } : {})
  });

  const payload = await response.json() as { routes?: Array<{ distanceMeters?: unknown }>; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || "Google Maps คำนวณเส้นทางไม่สำเร็จ");
  const distanceMeters = Number(payload.routes?.[0]?.distanceMeters);
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) throw new Error("Google Maps ไม่พบระยะทางสำหรับเส้นทางนี้");
  return Math.round(distanceMeters);
}
