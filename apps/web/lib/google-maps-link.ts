export type ResolvedGoogleMapsLocation = {
  originalUrl: string;
  resolvedUrl: string;
  googleName: string;
  lat: number;
  lng: number;
  googlePlaceId?: string;
  navigationUrl: string;
};

const GOOGLE_MAPS_HOSTS = new Set([
  "google.com",
  "www.google.com",
  "maps.google.com",
  "maps.app.goo.gl"
]);

export function isAllowedGoogleMapsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && GOOGLE_MAPS_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function coordinate(value: string | null) {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function coordinatesFromUrl(url: URL) {
  const decoded = decodeURIComponent(url.href);
  const dataPair = decoded.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (dataPair) return { lat: Number(dataPair[1]), lng: Number(dataPair[2]) };

  const query = url.searchParams.get("query") || url.searchParams.get("q") || url.searchParams.get("destination");
  const queryPair = query?.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (queryPair) return { lat: Number(queryPair[1]), lng: Number(queryPair[2]) };

  const pathPair = url.pathname
    .split("/")
    .filter(Boolean)
    .find((segment) => /^[+-]?\d+(?:\.\d+)?,[+-]?\d+(?:\.\d+)?$/.test(decodeURIComponent(segment)));
  if (pathPair) {
    const [lat, lng] = decodeURIComponent(pathPair).split(",").map(Number);
    return { lat, lng };
  }

  const viewportPair = decoded.match(/\/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (viewportPair) return { lat: Number(viewportPair[1]), lng: Number(viewportPair[2]) };

  const lat = coordinate(url.searchParams.get("lat"));
  const lng = coordinate(url.searchParams.get("lng"));
  return lat !== null && lng !== null ? { lat, lng } : null;
}

function cleanGoogleName(value: string) {
  return value
    .replace(/\+/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([ฯ,.])/g, "$1")
    .trim();
}

function nameFromUrl(url: URL) {
  const segments = url.pathname.split("/").filter(Boolean);
  const placeIndex = segments.indexOf("place");
  if (placeIndex >= 0 && segments[placeIndex + 1]) {
    return cleanGoogleName(decodeURIComponent(segments[placeIndex + 1]));
  }
  return cleanGoogleName(url.searchParams.get("query") || url.searchParams.get("q") || "");
}

function validCoordinates(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export function parseGoogleMapsUrl(originalUrl: string, resolvedUrl = originalUrl): ResolvedGoogleMapsLocation {
  if (!isAllowedGoogleMapsUrl(originalUrl) || !isAllowedGoogleMapsUrl(resolvedUrl)) {
    throw new Error("รองรับเฉพาะลิงก์ HTTPS จาก Google Maps");
  }

  const url = new URL(resolvedUrl);
  const point = coordinatesFromUrl(url);
  if (!point || !validCoordinates(point.lat, point.lng)) {
    throw new Error("ไม่พบพิกัดในลิงก์ กรุณาเปิดลิงก์ใน Google Maps แล้วแชร์ใหม่อีกครั้ง");
  }

  const googlePlaceId = url.searchParams.get("query_place_id") || undefined;
  const googleName = nameFromUrl(url) || "สถานที่จาก Google Maps";
  const destination = googlePlaceId
    ? `${point.lat},${point.lng}&destination_place_id=${encodeURIComponent(googlePlaceId)}`
    : `${point.lat},${point.lng}`;

  return {
    originalUrl,
    resolvedUrl,
    googleName,
    lat: point.lat,
    lng: point.lng,
    googlePlaceId,
    navigationUrl: `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`
  };
}

export async function resolveGoogleMapsLink(url: string) {
  const response = await fetch("/api/maps/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });
  const data = await response.json() as ResolvedGoogleMapsLocation & { error?: string };
  if (!response.ok) throw new Error(data.error || "อ่านลิงก์ Google Maps ไม่สำเร็จ");
  return data;
}
