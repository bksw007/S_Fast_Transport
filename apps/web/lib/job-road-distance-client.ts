import { auth } from "./firebase-auth";
import { coordinateFingerprint, type RouteCoordinate } from "./google-routes-distance";

export async function requestJobRoadDistance(jobId: string, origin: RouteCoordinate, destination: RouteCoordinate) {
  if (!coordinateFingerprint(origin, destination)) throw new Error("ไม่มีพิกัดสำหรับคำนวณระยะทาง");
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("กรุณาเข้าสู่ระบบอีกครั้ง");
  const response = await fetch("/api/maps/distance", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await currentUser.getIdToken()}` },
    body: JSON.stringify({ jobId, origin, destination })
  });
  const payload = await response.json() as { distanceMeters?: unknown; error?: string };
  const distanceMeters = Number(payload.distanceMeters);
  if (!response.ok || !Number.isFinite(distanceMeters) || distanceMeters <= 0) throw new Error(payload.error || "คำนวณระยะทางไม่สำเร็จ");
  return Math.round(distanceMeters);
}
