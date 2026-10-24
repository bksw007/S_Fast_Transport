import { collection, deleteField, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, where, writeBatch, type DocumentData } from "firebase/firestore";
import { db } from "./firebase";
import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "./firebase";
import { canReceiveDriverJobs, hasApprovedAccess, isMainAdmin, type UserProfile } from "./transport-repository";
import { statusLabels, type TransportJob } from "@s-fast-transport/shared";
import { coordinateFingerprint } from "./google-routes-distance";
import { validateJobEditDraft, type JobEditDraft } from "./job-edit";
import { resolveCustomerId } from "./customer-repository";

export type JobRecord = { id: string; data: DocumentData };
export async function permanentlyDeleteCancelledJob(job: Pick<TransportJob, "id" | "workOrder">) {
  const callable = httpsCallable<{ jobId: string; workOrder: string }, { deleted: boolean }>(getFunctions(firebaseApp, "asia-southeast1"), "permanentlyDeleteCancelledJob");
  const response = await callable({ jobId: job.id, workOrder: job.workOrder });
  if (!response.data.deleted) throw new Error("ลบใบงานไม่สำเร็จ กรุณาลองใหม่");
}
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
    assertCurrentJobAccess(current, actor);
    transaction.update(jobRef, { ...settings, updatedAt: serverTimestamp() });
    transaction.set(eventRef, { jobId: job.id, type: "settings_updated", message: "แก้ไขเบอร์ติดต่อ กำหนดถึง และหมายเหตุ", actorUid: actor.uid, actorName: actor.displayName, organizationId: current.organizationId, timestamp: serverTimestamp() });
  });
}

export function canAdministerJob(job: Pick<TransportJob, "organizationId" | "status">, actor: UserProfile) {
  return hasApprovedAccess(actor)
    && (isMainAdmin(actor) || (actor.role === "subcontract_admin" && actor.organizationId === job.organizationId && !["pending_subcontract", "subcontract_accepted"].includes(job.status)));
}

export async function resolveDriverIssue(job: TransportJob, note: string, actor: UserProfile) {
  if (!canAdministerJob(job, actor)) throw new Error("ไม่มีสิทธิ์จัดการปัญหาของใบงานนี้");
  const cleanNote = note.trim().slice(0, 500);
  if (!cleanNote) throw new Error("กรุณาระบุวิธีแก้ไขหรือคำแนะนำให้คนขับ");
  const jobRef = doc(db, "today_jobs", job.id);
  const eventRef = doc(collection(db, "job_events"));
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(jobRef);
    if (!snapshot.exists()) throw new Error("ไม่พบใบงาน");
    const current = snapshot.data();
    assertCurrentJobAccess(current, actor);
    if (!current.lastIssue || current.lastIssue.resolvedAt) throw new Error("ปัญหานี้ถูกจัดการแล้ว");
    transaction.update(jobRef, {
      ...(current.status === "problem" && current.issuePreviousStatus ? { status: current.issuePreviousStatus, issuePreviousStatus: deleteField() } : {}),
      lastIssue: { ...current.lastIssue, resolvedAt: new Date().toISOString(), resolvedBy: actor.displayName, resolutionNote: cleanNote },
      updatedAt: serverTimestamp()
    });
    transaction.set(eventRef, { jobId: job.id, organizationId: current.organizationId ?? "main", type: "driver_issue_resolved", message: `ผู้ดูแลดำเนินการแล้ว: ${cleanNote}`, actorUid: actor.uid, actorName: actor.displayName, timestamp: serverTimestamp(), metadata: { note: cleanNote, previousStatus: current.issuePreviousStatus ?? current.status } });
  });
}

function assertCurrentJobAccess(current: DocumentData, actor: UserProfile) {
  if (!hasApprovedAccess(actor) || (!isMainAdmin(actor) && !(actor.role === "subcontract_admin" && actor.organizationId === current.organizationId && !["pending_subcontract", "subcontract_accepted"].includes(current.status)))) {
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
  if (!user || !canReceiveDriverJobs(user as UserProfile, organizationId)) {
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
  const previousOrganizationId = String(initial.organizationId ?? "main");
  const organizationId = values.assignedOrganizationId;
  const companyChanged = organizationId !== previousOrganizationId;
  const awaitingSubcontract = organizationId !== "main" && (companyChanged || ["pending_subcontract", "subcontract_accepted"].includes(initial.status));
  if (companyChanged && !(isMainAdmin(actor) && actor.organizationId === "main" && initial.originOrganizationId === "main"
    && (initial.status === "pending_subcontract" || (previousOrganizationId === "main" && initial.status === "assigned" && initial.trackingStatus === "not_started" && !initial.trackingEnabled)))) {
    throw new Error("เปลี่ยนบริษัทได้เฉพาะงานที่ยังไม่เริ่มหรือยังรอบริษัทซับรับงาน");
  }
  let carrierName = String(initial.carrierName ?? "S Fast Transport");
  if (companyChanged) {
    const company = (await getDoc(doc(db, "organizations", organizationId))).data();
    if (organizationId !== "main" && (company?.type !== "subcontract" || company.active !== true || company.deleted === true)) throw new Error("บริษัทซับไม่พร้อมรับงาน");
    carrierName = String(company?.name || (organizationId === "main" ? actor.organizationName || "S Fast Transport" : organizationId));
  }
  const customerId = actor.organizationId === "main" ? await resolveCustomerId(values.customer, actor) : null;
  if (awaitingSubcontract && values.driverId) throw new Error("กรุณามอบหมายคนขับผ่านเมนูงานที่ได้รับมอบหมาย");
  if (!awaitingSubcontract && !values.driverId && (companyChanged || !initial.assignedDriverUid)) throw new Error("กรุณาเลือกพนักงานขับรถ");
  const assignment = !awaitingSubcontract && values.driverId && (companyChanged || values.driverId !== initial.driverId)
    ? await loadDriverAssignment(values.driverId, organizationId)
    : null;
  const links = companyChanged ? await getDocs(query(collection(db, "tracking_share_links"), where("jobId", "==", job.id))) : null;
  const eventRef = doc(collection(db, "job_events"));

  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(jobRef);
    if (!snapshot.exists()) throw new Error("ไม่พบใบงาน");
    const current = snapshot.data();
    assertCurrentJobAccess(current, actor);
    if (String(current.organizationId ?? "main") !== previousOrganizationId) throw new Error("บริษัทของใบงานมีการเปลี่ยนแปลง กรุณาเปิดใหม่");
    if (current.status !== initial.status && (awaitingSubcontract || companyChanged)) throw new Error("สถานะงานเปลี่ยนแล้ว กรุณาเปิดใหม่");
    if (companyChanged && (current.trackingStatus !== initial.trackingStatus || current.trackingEnabled !== initial.trackingEnabled)) throw new Error("งานเริ่มดำเนินการแล้ว กรุณาเปิดใหม่");
    if (current.status === "completed" && Boolean(current.returnTrip) !== Boolean(values.returnTrip)) throw new Error("งานเสร็จแล้ว ไม่สามารถเปลี่ยนการรับสินค้ากลับได้");
    if (current.returnTrip && !values.returnTrip && (current.activeLeg === 2 || current.returnPickupProof || current.returnDeliveryProof)) throw new Error("เริ่มงานขากลับแล้ว ไม่สามารถยกเลิกรับสินค้ากลับได้");
    const changedRoute = coordinateFingerprint(current.pickupPlace, current.deliveryPlace) !== coordinateFingerprint(values.pickupPlace, values.deliveryPlace);
    const activeLinks = links ? await Promise.all(links.docs.map(link => transaction.get(link.ref))) : [];
    transaction.update(jobRef, {
      ...(companyChanged ? {
        organizationId, carrierName, status: organizationId === "main" ? "assigned" : "pending_subcontract",
        ...(awaitingSubcontract ? { driverId: "", vehicleId: deleteField(), assignedDriverUid: deleteField(), driverName: "", driverPhone: "" } : {})
      } : {}),
      customer: values.customer,
      ...(customerId ? { customerId } : {}),
      ...(!customerId && current.customerId && current.customer !== values.customer ? { customerId: deleteField() } : {}),
      jobDate: values.jobDate,
      cargoType: values.cargoType,
      vehicleType: values.vehicleType,
      tripCount: values.tripCount,
      returnTrip: values.returnTrip ?? deleteField(),
      ...(!values.returnTrip ? { activeLeg: deleteField() } : current.activeLeg ? {} : { activeLeg: 1 }),
      vehiclePlate: awaitingSubcontract ? "" : values.vehiclePlate,
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
    activeLinks.forEach((link, index) => {
      if (link.exists() && link.data().enabled === true) transaction.update(links!.docs[index].ref, {
        organizationId, carrierName, statusLabel: statusLabels[organizationId === "main" ? "assigned" : "pending_subcontract"],
        vehicleLabel: awaitingSubcontract ? "" : values.vehiclePlate, updatedAt: serverTimestamp()
      });
    });
    transaction.set(eventRef, {
      jobId: job.id,
      type: "details_updated",
      message: companyChanged ? `แก้ไขรายละเอียดและมอบหมายให้บริษัท ${carrierName}` : "แก้ไขรายละเอียดใบงาน",
      actorUid: actor.uid,
      actorName: actor.displayName,
      organizationId,
      timestamp: serverTimestamp()
    });
  });

  await syncEditedShareLinks(job.id, { ...values, organizationId });
}

export async function deleteJob(job: TransportJob, actor: UserProfile) {
  if (job.originOrganizationId === "main" && !isMainAdmin(actor)) throw new Error("เฉพาะบริษัทหลักเท่านั้นที่ลบใบงานนี้ได้");
  if (!canAdministerJob(job, actor)) throw new Error("เฉพาะแอดมินที่ดูแลใบงานนี้เท่านั้นที่ลบได้");
  const jobRef = doc(db, "today_jobs", job.id);
  const eventRef = doc(collection(db, "job_events"));
  let organizationId = String(job.organizationId ?? "main");
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(jobRef);
    if (!snapshot.exists()) throw new Error("ไม่พบใบงาน");
    const current = snapshot.data();
    assertCurrentJobAccess(current, actor);
    if (current.originOrganizationId === "main" && !isMainAdmin(actor)) throw new Error("เฉพาะบริษัทหลักเท่านั้นที่ลบใบงานนี้ได้");
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
