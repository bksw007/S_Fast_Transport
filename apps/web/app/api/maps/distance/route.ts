import { NextResponse } from "next/server";
import { coordinateFingerprint, requestGoogleRouteDistance, validRouteCoordinate, type RouteCoordinate } from "@/lib/google-routes-distance";

export const runtime = "nodejs";

type FirestoreValue = {
  doubleValue?: number | string;
  integerValue?: number | string;
  mapValue?: { fields?: Record<string, FirestoreValue> };
};

function firestoreNumber(value?: FirestoreValue) {
  const parsed = Number(value?.doubleValue ?? value?.integerValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function firestoreCoordinate(value?: FirestoreValue): RouteCoordinate | null {
  const fields = value?.mapValue?.fields;
  const point = { lat: firestoreNumber(fields?.lat), lng: firestoreNumber(fields?.lng) };
  return validRouteCoordinate(point) ? point : null;
}

async function authorizedJobCoordinates(jobId: string, authorization: string) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  if (!projectId) throw new Error("Firebase project is not configured");
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/today_jobs/${encodeURIComponent(jobId)}`;
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Authorization: authorization },
    signal: AbortSignal.timeout(8_000)
  });
  if (!response.ok) return null;
  const payload = await response.json() as { fields?: Record<string, FirestoreValue> };
  const origin = firestoreCoordinate(payload.fields?.pickupPlace);
  const destination = firestoreCoordinate(payload.fields?.deliveryPlace);
  return origin && destination ? { origin, destination } : null;
}

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    if (!/^Bearer\s+\S+$/i.test(authorization)) {
      return NextResponse.json({ error: "กรุณาเข้าสู่ระบบอีกครั้ง" }, { status: 401 });
    }

    const body = await request.json() as { jobId?: unknown; origin?: unknown; destination?: unknown };
    const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
    if (!jobId || jobId.length > 1500 || jobId.includes("/") || !validRouteCoordinate(body.origin) || !validRouteCoordinate(body.destination)) {
      return NextResponse.json({ error: "ข้อมูลเส้นทางไม่ถูกต้อง" }, { status: 400 });
    }

    const savedCoordinates = await authorizedJobCoordinates(jobId, authorization);
    if (!savedCoordinates) return NextResponse.json({ error: "ไม่มีสิทธิ์อ่านใบงานหรือไม่พบพิกัด" }, { status: 403 });
    if (coordinateFingerprint(body.origin, body.destination) !== coordinateFingerprint(savedCoordinates.origin, savedCoordinates.destination)) {
      return NextResponse.json({ error: "พิกัดไม่ตรงกับใบงานล่าสุด" }, { status: 409 });
    }

    const apiKey = process.env.GOOGLE_MAPS_ROUTES_API_KEY?.trim() ?? "";
    if (!apiKey) return NextResponse.json({ error: "ยังไม่ได้เปิดใช้ระยะทาง Google Maps" }, { status: 503 });
    const distanceMeters = await requestGoogleRouteDistance(savedCoordinates.origin, savedCoordinates.destination, apiKey);
    return NextResponse.json({ distanceMeters, provider: "google_routes" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "คำนวณระยะทางไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
