import { collection, doc, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, where, type DocumentData } from "firebase/firestore";
import { db } from "./firebase";
import { hasApprovedAccess, isMainAdmin, type UserProfile } from "./transport-repository";
import type { TransportJob } from "@s-fast-transport/shared";
import { coordinateFingerprint } from "./google-routes-distance";

export type JobRecord = { id: string; data: DocumentData };
export type JobSettings = { driverPhone: string; eta: string; notes: string };
export function subscribeJobRecords(jobId: string, kind: "proofs" | "events" | "locations", next: (rows: JobRecord[]) => void, fail: (error: Error) => void) {
  const source = kind === "locations"
    ? query(collection(db, "job_locations", jobId, "points"), orderBy("timestamp", "desc"), limit(500))
    : query(collection(db, kind === "proofs" ? "proof_of_delivery" : "job_events"), where("jobId", "==", jobId));
  return onSnapshot(source, snapshot => next(snapshot.docs.map(row => ({ id: row.id, data: row.data() })).sort((a, b) => recordTime(b.data) - recordTime(a.data))), fail);
}
export function recordTime(data: DocumentData): number {
  const value = data.timestamp ?? data.createdAt;
  if (value?.toMillis) return value.toMillis();
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}
export async function saveJobSettings(job: TransportJob, settings: JobSettings, actor: UserProfile) {
  if (!hasApprovedAccess(actor)) throw new Error("ไม่มีสิทธิ์แก้ไขงาน");
  const jobRef = doc(db, "today_jobs", job.id);
  const eventRef = doc(collection(db, "job_events"));
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(jobRef);
    if (!snapshot.exists()) throw new Error("ไม่พบใบงาน");
    const current = snapshot.data();
    if (!isMainAdmin(actor) && !(actor.role === "subcontract_admin" && actor.organizationId === current.organizationId)) throw new Error("ไม่มีสิทธิ์แก้ไขงานนี้");
    transaction.update(jobRef, { ...settings, updatedAt: serverTimestamp() });
    transaction.set(eventRef, { jobId: job.id, type: "settings_updated", message: "แก้ไขเบอร์ติดต่อ กำหนดถึง และหมายเหตุ", actorUid: actor.uid, actorName: actor.displayName, organizationId: current.organizationId, timestamp: serverTimestamp() });
  });
}

export async function saveJobRouteDistance(job: TransportJob, distanceMeters: number, fingerprint: string, actor: UserProfile) {
  if (!hasApprovedAccess(actor)) throw new Error("ไม่มีสิทธิ์แก้ไขงาน");
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0 || distanceMeters > 10_000_000) throw new Error("ระยะทางไม่ถูกต้อง");
  const jobRef = doc(db, "today_jobs", job.id);
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(jobRef);
    if (!snapshot.exists()) throw new Error("ไม่พบใบงาน");
    const current = snapshot.data();
    if (!isMainAdmin(actor) && !(actor.role === "subcontract_admin" && actor.organizationId === current.organizationId)) throw new Error("ไม่มีสิทธิ์แก้ไขงานนี้");
    if (coordinateFingerprint(current.pickupPlace, current.deliveryPlace) !== fingerprint) throw new Error("พิกัดใบงานมีการเปลี่ยนแปลง");
    transaction.update(jobRef, {
      routeDistanceMeters: Math.round(distanceMeters),
      routeDistanceFingerprint: fingerprint,
      routeDistanceProvider: "google_routes",
      routeDistanceCalculatedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
}
