import { collection, deleteField, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, where, writeBatch, type DocumentData } from "firebase/firestore";
import { db } from "./firebase";
import { hasApprovedAccess, isMainAdmin, type UserProfile } from "./transport-repository";
import type { TransportJob } from "@s-fast-transport/shared";
import { coordinateFingerprint } from "./google-routes-distance";
import { validateJobEditDraft, type JobEditDraft } from "./job-edit";

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

export function canAdministerJob(job: Pick<TransportJob, "organizationId">, actor: UserProfile) {
  return hasApprovedAccess(actor)
    && (isMainAdmin(actor) || (actor.role === "subcontract_admin" && actor.organizationId === job.organizationId));
}

function assertCurrentJobAccess(current: DocumentData, actor: UserProfile) {
  if (!hasApprovedAccess(actor) || (!isMainAdmin(actor) && !(actor.role === "subcontract_admin" && actor.organizationId === current.organizationId))) {
    throw new Error("ไม่มีสิทธิ์จัดการใบงานนี้");
  }
}

async function loadDriverAssignment(driverId: string, organizationId: string) {
  const driverSnapshot = await getDoc(doc(db, "drivers", driverId));
  if (!driverSnapshot.exists()) throw new Error("ไม่พบข้อมูลคนขับ กรุณาเลือกใหม่");
  const driver = driverSnapshot.data();
  if (driver.organizationId !== organizationId || driver.status === "inactive" || !driver.userUid) throw new Error("คนขับไม่พร้อมใช้งานหรือไม่ได้อยู่ในบริษัทนี้");
  const userSnapshot = await getDoc(doc(db, "users", driver.userUid));
  const user = userSnapshot.data();
  if (!user || user.role !== "driver" || user.active !== true || user.approvalStatus !== "approved" || user.organizationId !== organizationId) {
    throw new Error("บัญชีแอปของคนขับยังไม่พร้อมรับงาน");
  }
  return { driverId, assignedDriverUid: driver.userUid as string, driverName: String(user.fullName || driver.name), driverPhone: String(user.phone || driver.phone || "") };
}

async function syncEditedShareLinks(jobId: string, values: {
  organizationId: string;
  customer: string;
  pickupLocation: string;
  pickupPlace?: TransportJob["pickupPlace"];
  deliveryLocation: string;
  deliveryPlace?: TransportJob["deliveryPlace"];
  vehiclePlate: string;
  eta: string;
}) {
  const links = await getDocs(query(
    collection(db, "tracking_share_links"),
    where("jobId", "==", jobId),
    where("organizationId", "==", values.organizationId),
    where("enabled", "==", true)
  ));
  if (links.empty) return;
  const batch = writeBatch(db);
  links.docs.forEach(link => batch.update(link.ref, {
    customerName: values.customer,
    pickupLocation: values.pickupLocation,
    pickupPlace: values.pickupPlace ?? deleteField(),
    deliveryLocation: values.deliveryLocation,
    deliveryPlace: values.deliveryPlace ?? deleteField(),
    vehicleLabel: values.vehiclePlate,
    eta: values.eta,
    updatedAt: serverTimestamp()
  }));
  await batch.commit();
}

export async function updateJobDetails(job: TransportJob, draft: JobEditDraft, actor: UserProfile) {
  const values = validateJobEditDraft(draft);
  const jobRef = doc(db, "today_jobs", job.id);
  const initialSnapshot = await getDoc(jobRef);
  if (!initialSnapshot.exists()) throw new Error("ไม่พบใบงาน");
  const initial = initialSnapshot.data();
  assertCurrentJobAccess(initial, actor);
  const organizationId = String(initial.organizationId ?? "main");
  if (!values.driverId && !initial.assignedDriverUid) throw new Error("กรุณาเลือกพนักงานขับรถ");
  const assignment = values.driverId && values.driverId !== initial.driverId
    ? await loadDriverAssignment(values.driverId, organizationId)
    : null;
  const eventRef = doc(collection(db, "job_events"));

  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(jobRef);
    if (!snapshot.exists()) throw new Error("ไม่พบใบงาน");
    const current = snapshot.data();
    assertCurrentJobAccess(current, actor);
    if (String(current.organizationId ?? "main") !== organizationId) throw new Error("บริษัทของใบงานมีการเปลี่ยนแปลง กรุณาเปิดใหม่");
    const changedRoute = coordinateFingerprint(current.pickupPlace, current.deliveryPlace) !== coordinateFingerprint(values.pickupPlace, values.deliveryPlace);
    transaction.update(jobRef, {
      customer: values.customer,
      jobDate: values.jobDate,
      cargoType: values.cargoType,
      vehicleType: values.vehicleType,
      tripCount: values.tripCount,
      vehiclePlate: values.vehiclePlate,
      pickupLocation: values.pickupLocation,
      pickupPlace: values.pickupPlace ?? deleteField(),
      pickupDate: values.pickupDate,
      pickupTime: values.pickupTime,
      pickupContactId: values.pickupContactId,
      pickupContact: values.pickupContact,
      pickupContactPhone: values.pickupContactPhone,
      pickupContactNotes: values.pickupContactNotes,
      deliveryLocation: values.deliveryLocation,
      deliveryPlace: values.deliveryPlace ?? deleteField(),
      deliveryDate: values.deliveryDate,
      deliveryTime: values.deliveryTime,
      deliveryContactId: values.deliveryContactId,
      deliveryContact: values.deliveryContact,
      deliveryContactPhone: values.deliveryContactPhone,
      deliveryContactNotes: values.deliveryContactNotes,
      eta: values.eta,
      notes: values.notes,
      ...(assignment ?? {}),
      ...(changedRoute ? {
        routeDistanceMeters: deleteField(),
        routeDistanceFingerprint: deleteField(),
        routeDistanceProvider: deleteField(),
        routeDistanceCalculatedAt: deleteField()
      } : {}),
      updatedAt: serverTimestamp()
    });
    transaction.set(eventRef, {
      jobId: job.id,
      type: "details_updated",
      message: "แก้ไขรายละเอียดใบงาน",
      actorUid: actor.uid,
      actorName: actor.displayName,
      organizationId,
      timestamp: serverTimestamp()
    });
  });

  await syncEditedShareLinks(job.id, { ...values, organizationId });
}

export async function deleteJob(job: TransportJob, actor: UserProfile) {
  if (!canAdministerJob(job, actor)) throw new Error("เฉพาะแอดมินที่ดูแลใบงานนี้เท่านั้นที่ลบได้");
  const jobRef = doc(db, "today_jobs", job.id);
  const eventRef = doc(collection(db, "job_events"));
  let organizationId = String(job.organizationId ?? "main");
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(jobRef);
    if (!snapshot.exists()) throw new Error("ไม่พบใบงาน");
    const current = snapshot.data();
    assertCurrentJobAccess(current, actor);
    organizationId = String(current.organizationId ?? "main");
    transaction.update(jobRef, {
      deletedAt: serverTimestamp(),
      deletedByUid: actor.uid,
      deletedByName: actor.displayName,
      status: "cancelled",
      trackingEnabled: false,
      updatedAt: serverTimestamp()
    });
    transaction.set(eventRef, {
      jobId: job.id,
      type: "job_deleted",
      message: "ลบใบงานออกจากรายการ",
      actorUid: actor.uid,
      actorName: actor.displayName,
      organizationId: current.organizationId,
      timestamp: serverTimestamp()
    });
  });

  const links = await getDocs(query(
    collection(db, "tracking_share_links"),
    where("jobId", "==", job.id),
    where("organizationId", "==", organizationId),
    where("enabled", "==", true)
  ));
  if (!links.empty) {
    const batch = writeBatch(db);
    links.docs.forEach(link => batch.update(link.ref, { enabled: false, updatedAt: serverTimestamp() }));
    await batch.commit();
  }
}
