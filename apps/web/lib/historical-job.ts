import { collection, deleteField, doc, getDoc, runTransaction, serverTimestamp, Timestamp } from "firebase/firestore";
import { deleteObject, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "./firebase";
import { compressImageForUpload, isImageFile, MAX_SOURCE_IMAGE_BYTES } from "./image-upload";
import { resolveCustomerId } from "./customer-repository";
import { hasApprovedAccess, isMainAdmin, type UserProfile } from "./transport-repository";
import { historicalWorkOrder } from "./historical-work-order";
import { loadCompanySettings } from "./settings-repository";
import { coordinateFingerprint } from "./google-routes-distance";
import { syncEditedShareLinks } from "./job-detail-repository";
import type { JobPlace, TransportJob } from "@s-fast-transport/shared";

export const historicalPhotoCategories = ["pickup", "delivery", "document", "expense"] as const;
export type HistoricalPhotoCategory = typeof historicalPhotoCategories[number];
export type HistoricalPhotos = Record<HistoricalPhotoCategory, File[]>;
export const historicalPhotoLabels: Record<HistoricalPhotoCategory, string> = {
  pickup: "รูปรับสินค้า", delivery: "รูปลงสินค้า", document: "รูปเอกสาร", expense: "รูปค่าใช้จ่ายคนขับ"
};
const emptyEvidence = (): Record<HistoricalPhotoCategory, string[]> => ({ pickup: [], delivery: [], document: [], expense: [] });
export type HistoricalJobDraft = {
  submissionId: string;
  customer: string;
  carrierOrganizationId: string;
  driverId: string;
  vehiclePlate: string;
  vehicleType: string;
  cargoType: string;
  tripCount: string;
  pickupDate: string;
  pickupTime: string;
  pickupLocation: string;
  pickupPlace?: JobPlace;
  deliveryDate: string;
  deliveryTime: string;
  deliveryLocation: string;
  deliveryPlace?: JobPlace;
  arrivedPickupAt: string;
  arrivedDeliveryAt: string;
  notes: string;
};

function bangkokToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && new Date(`${value}T00:00:00+07:00`).toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }) === value;
}

function dateTime(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error(`กรุณาระบุ${label}ให้ถูกต้อง`);
  const parsed = new Date(`${value}:00+07:00`);
  if (!Number.isFinite(parsed.getTime()) || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed) !== value.slice(0, 10)) throw new Error(`${label}ไม่ถูกต้อง`);
  return parsed;
}

export function validateHistoricalDetails(draft: HistoricalJobDraft) {
  const required = [draft.customer, draft.carrierOrganizationId, draft.driverId, draft.vehiclePlate, draft.pickupLocation, draft.deliveryLocation];
  if (required.some(value => !value.trim())) throw new Error("กรุณาเลือกลูกค้า บริษัทขนส่ง คนขับ และระบุทะเบียนรถกับสถานที่รับ–ส่งให้ครบ");
  if (draft.pickupLocation.length > 160 || draft.deliveryLocation.length > 160 || draft.notes.length > 2000) throw new Error("ชื่อสถานที่หรือหมายเหตุยาวเกินกำหนด");
  if (![draft.pickupDate, draft.deliveryDate].every(validDate)) throw new Error("กรุณาระบุวันที่งานให้ถูกต้องและครบถ้วน");
  if (draft.pickupDate > bangkokToday() || draft.deliveryDate > bangkokToday()) throw new Error("งานย้อนหลังต้องไม่ระบุวันที่ในอนาคต");
  if (draft.deliveryDate < draft.pickupDate) throw new Error("วันที่ส่งสินค้าต้องไม่ก่อนวันที่รับสินค้า");
  if (draft.pickupTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.pickupTime) || draft.deliveryTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.deliveryTime)) throw new Error("เวลาในใบงานไม่ถูกต้อง");
  const arrived = dateTime(draft.arrivedDeliveryAt, "เวลาถึงจุดส่งจริง");
  const arrivedPickup = draft.arrivedPickupAt ? dateTime(draft.arrivedPickupAt, "เวลาถึงจุดรับจริง") : null;
  const dayStart = dateTime(`${draft.pickupDate}T00:00`, "วันที่รับสินค้า");
  if (arrived < dayStart || arrived > new Date() || arrivedPickup && (arrivedPickup < dayStart || arrivedPickup > arrived)) throw new Error("เวลาถึงจุดรับหรือจุดส่งไม่สอดคล้องกับวันที่ทำงาน");
  const tripCount = Number(draft.tripCount);
  if (!Number.isInteger(tripCount) || tripCount < 1 || tripCount > 999) throw new Error("จำนวนเที่ยวต้องอยู่ระหว่าง 1–999");
  return { completed: arrived, arrived, arrivedPickup, tripCount };
}

export function validateHistoricalJob(draft: HistoricalJobDraft, photos: HistoricalPhotos) {
  const details = validateHistoricalDetails(draft);
  validateHistoricalPhotos(photos);
  return details;
}

function validateHistoricalPhotos(photos: HistoricalPhotos) {
  for (const category of historicalPhotoCategories) {
    if (photos[category].length > 10 || photos[category].some(file => !isImageFile(file) || file.size < 1 || file.size > MAX_SOURCE_IMAGE_BYTES)) throw new Error("แต่ละหมวดแนบได้ไม่เกิน 10 รูป และรูปต้นฉบับต้องไม่เกิน 20 MB ต่อรูป");
  }
}

async function uploadHistoricalPhotos(jobId: string, photos: HistoricalPhotos, actor: UserProfile, uploaded: string[], onProgress?: (message: string) => void) {
  const paths = emptyEvidence();
  for (const category of historicalPhotoCategories) {
    for (const [index, source] of photos[category].entries()) {
      onProgress?.(`กำลังอัปโหลด${historicalPhotoLabels[category]} ${index + 1}/${photos[category].length}`);
      const file = await compressImageForUpload(source);
      const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `historical_jobs/${jobId}/${actor.uid}/${category}/${crypto.randomUUID()}.${extension}`;
      uploaded.push(path);
      await uploadBytes(ref(storage, path), file, { contentType: file.type });
      paths[category].push(path);
    }
  }
  return paths;
}

async function resolveHistoricalAssignment(draft: HistoricalJobDraft, actor: UserProfile) {
  const company = draft.carrierOrganizationId === "main" ? null : (await getDoc(doc(db, "organizations", draft.carrierOrganizationId))).data();
  if (draft.carrierOrganizationId !== "main" && (company?.type !== "subcontract" || company.deleted === true)) throw new Error("ไม่พบบริษัทขนส่งที่เลือก กรุณาเลือกใหม่");
  const carrierName = draft.carrierOrganizationId === "main"
    ? (await loadCompanySettings("main")).name || actor.organizationName || "S Fast Transport"
    : String(company?.name || "").trim();
  const driver = (await getDoc(doc(db, "drivers", draft.driverId))).data();
  if (!driver || driver.organizationId !== draft.carrierOrganizationId || !String(driver.name || "").trim()) throw new Error("คนขับไม่อยู่ในบริษัทขนส่งที่เลือก กรุณาเลือกใหม่");
  return { carrierName, driverName: String(driver.name).trim(), driverPhone: String(driver.phone || "") };
}

export async function createHistoricalJob(draft: HistoricalJobDraft, photos: HistoricalPhotos, actor: UserProfile, onProgress?: (message: string) => void) {
  if (!hasApprovedAccess(actor) || !isMainAdmin(actor) || actor.organizationId !== "main") throw new Error("เฉพาะแอดมินบริษัทหลักเท่านั้นที่เพิ่มใบงานย้อนหลังได้");
  const { completed, arrived, arrivedPickup, tripCount } = validateHistoricalJob(draft, photos);
  const { carrierName, driverName, driverPhone } = await resolveHistoricalAssignment(draft, actor);
  const jobRef = doc(db, "today_jobs", draft.submissionId);
  const existing = await getDoc(jobRef);
  if (existing.exists()) {
    if (existing.data().historical && existing.data().createdByUid === actor.uid) return existing.data().workOrder as string;
    throw new Error("รหัสรายการนี้ถูกใช้แล้ว กรุณาเปิดฟอร์มใหม่");
  }
  const uploaded: string[] = [];
  try {
    const paths = await uploadHistoricalPhotos(jobRef.id, photos, actor, uploaded, onProgress);
    onProgress?.("กำลังออกเลขและบันทึกใบงาน");
    const dateKey = `${draft.pickupDate.replaceAll("-", "")}PE`;
    const counterRef = doc(db, "job_counters", dateKey);
    const customerId = await resolveCustomerId(draft.customer.trim(), actor);
    const workOrder = await runTransaction(db, async transaction => {
      const prior = await transaction.get(jobRef);
      if (prior.exists()) {
        if (prior.data().historical && prior.data().createdByUid === actor.uid) return prior.data().workOrder as string;
        throw new Error("รหัสรายการนี้ถูกใช้แล้ว กรุณาเปิดฟอร์มใหม่");
      }
      const counter = await transaction.get(counterRef);
      const sequence = counter.exists() ? Number(counter.data().lastSequence) + 1 : 1;
      const number = historicalWorkOrder(draft.pickupDate, sequence);
      transaction.set(counterRef, { dateKey, lastSequence: sequence, updatedAt: serverTimestamp() });
      transaction.set(jobRef, {
        submissionId: draft.submissionId, historical: true, historicalEvidence: paths, workOrder: number,
        customer: draft.customer.trim(), ...(customerId ? { customerId } : {}), carrierName, carrierOrganizationId: draft.carrierOrganizationId,
        driverId: draft.driverId, driverName, driverPhone, vehiclePlate: draft.vehiclePlate.trim(),
        vehicleType: draft.vehicleType.trim(), cargoType: draft.cargoType.trim(), tripCount,
        jobDate: draft.pickupDate, pickupDate: draft.pickupDate, pickupTime: draft.pickupTime,
        pickupLocation: draft.pickupLocation.trim(), ...(draft.pickupPlace ? { pickupPlace: draft.pickupPlace } : {}), deliveryDate: draft.deliveryDate,
        deliveryTime: draft.deliveryTime, deliveryLocation: draft.deliveryLocation.trim(), ...(draft.deliveryPlace ? { deliveryPlace: draft.deliveryPlace } : {}),
        ...(arrivedPickup ? { arrivedPickupAt: Timestamp.fromDate(arrivedPickup) } : {}), arrivedDeliveryAt: Timestamp.fromDate(arrived), completedAt: Timestamp.fromDate(completed),
        notes: draft.notes.trim(), organizationId: "main", originOrganizationId: "main",
        status: "completed", trackingStatus: "completed", trackingEnabled: false,
        lastUpdatedMinutes: 0, currentLocation: { lat: 0, lng: 0, speed: 0, heading: 0, accuracy: 0, updatedAt: new Date().toISOString() },
        alerts: [], eta: draft.deliveryTime, createdByUid: actor.uid,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
      return number;
    });
    return workOrder;
  } catch (error) {
    const saved = await getDoc(jobRef).catch(() => null);
    if (saved && !saved.exists()) await Promise.allSettled(uploaded.map(path => deleteObject(ref(storage, path))));
    throw error;
  }
}

export async function appendHistoricalPhotos(job: TransportJob, photos: HistoricalPhotos, actor: UserProfile, onProgress?: (message: string) => void) {
  if (!hasApprovedAccess(actor) || !isMainAdmin(actor) || actor.organizationId !== "main") throw new Error("เฉพาะแอดมินบริษัทหลักเท่านั้นที่เพิ่มรูปใบงานย้อนหลังได้");
  if (!job.historical) throw new Error("เพิ่มรูปได้เฉพาะใบงานย้อนหลัง");
  validateHistoricalPhotos(photos);
  if (historicalPhotoCategories.every(category => photos[category].length === 0)) throw new Error("กรุณาเลือกรูปที่ต้องการเพิ่ม");
  const jobRef = doc(db, "today_jobs", job.id);
  const uploaded: string[] = [];
  try {
    const paths = await uploadHistoricalPhotos(job.id, photos, actor, uploaded, onProgress);
    const eventRef = doc(collection(db, "job_events"));
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(jobRef);
      if (!snapshot.exists()) throw new Error("ไม่พบใบงาน");
      const current = snapshot.data();
      if (current.historical !== true || current.status !== "completed" || current.organizationId !== "main" || current.workOrder !== job.workOrder) throw new Error("ใบงานย้อนหลังนี้ไม่พร้อมให้เพิ่มรูป กรุณาเปิดใหม่");
      const evidence = current.historicalEvidence ?? emptyEvidence();
      const updated = emptyEvidence();
      for (const category of historicalPhotoCategories) {
        if (!Array.isArray(evidence[category]) || evidence[category].length + paths[category].length > 10) throw new Error(`รูป${historicalPhotoLabels[category]}เกิน 10 รูป กรุณาเปิดใบงานใหม่`);
        updated[category] = [...evidence[category], ...paths[category]];
      }
      transaction.update(jobRef, { historicalEvidence: updated, updatedAt: serverTimestamp() });
      transaction.set(eventRef, { jobId: job.id, type: "proof_uploaded", message: "เพิ่มรูปหลักฐานใบงานย้อนหลัง", actorUid: actor.uid, actorName: actor.displayName, organizationId: "main", timestamp: serverTimestamp() });
    });
  } catch (error) {
    await Promise.allSettled(uploaded.map(path => deleteObject(ref(storage, path))));
    throw error;
  }
}

export async function updateHistoricalJob(job: TransportJob, draft: HistoricalJobDraft, actor: UserProfile) {
  if (!hasApprovedAccess(actor) || !isMainAdmin(actor) || actor.organizationId !== "main") throw new Error("เฉพาะแอดมินบริษัทหลักเท่านั้นที่แก้ใบงานย้อนหลังได้");
  const { completed, arrived, arrivedPickup, tripCount } = validateHistoricalDetails(draft);
  if (!job.historical || draft.pickupDate !== job.pickupDate) throw new Error("วันที่รับสินค้าของใบงานย้อนหลังต้องตรงกับเลขใบงานเดิม");
  const { carrierName, driverName, driverPhone } = await resolveHistoricalAssignment(draft, actor);
  const customerId = await resolveCustomerId(draft.customer.trim(), actor);
  const jobRef = doc(db, "today_jobs", job.id);
  const eventRef = doc(collection(db, "job_events"));
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(jobRef);
    if (!snapshot.exists() || snapshot.data().historical !== true || snapshot.data().status !== "completed") throw new Error("ใบงานย้อนหลังนี้ไม่พร้อมให้แก้ไข");
    const current = snapshot.data();
    if (current.workOrder !== job.workOrder || current.pickupDate !== draft.pickupDate) throw new Error("เลขใบงานหรือวันที่รับสินค้าเปลี่ยนแล้ว กรุณาเปิดใหม่");
    const changedRoute = coordinateFingerprint(current.pickupPlace, current.deliveryPlace) !== coordinateFingerprint(draft.pickupPlace, draft.deliveryPlace);
    const keepPreviousCompletion = current.arrivedDeliveryAt?.toDate?.()?.getTime() === arrived.getTime() && current.completedAt;
    transaction.update(jobRef, {
      customer: draft.customer.trim(), customerId: customerId ?? deleteField(),
      carrierOrganizationId: draft.carrierOrganizationId, carrierName,
      driverId: draft.driverId, driverName, driverPhone,
      vehiclePlate: draft.vehiclePlate.trim(), vehicleType: draft.vehicleType.trim(), cargoType: draft.cargoType.trim(), tripCount,
      jobDate: draft.pickupDate, pickupTime: draft.pickupTime,
      pickupLocation: draft.pickupLocation.trim(), pickupPlace: draft.pickupPlace ?? deleteField(),
      deliveryDate: draft.deliveryDate, deliveryTime: draft.deliveryTime, deliveryLocation: draft.deliveryLocation.trim(),
      deliveryPlace: draft.deliveryPlace ?? deleteField(),
      arrivedPickupAt: arrivedPickup ? Timestamp.fromDate(arrivedPickup) : deleteField(), arrivedDeliveryAt: Timestamp.fromDate(arrived), completedAt: keepPreviousCompletion || Timestamp.fromDate(completed),
      ...(changedRoute ? { routeDistanceMeters: deleteField(), routeDistanceFingerprint: deleteField(), routeDistanceProvider: deleteField(), routeDistanceCalculatedAt: deleteField() } : {}),
      eta: draft.deliveryTime, notes: draft.notes.trim(), updatedAt: serverTimestamp()
    });
    transaction.set(eventRef, {
      jobId: job.id, type: "details_updated", message: "แก้ไขรายละเอียดใบงานย้อนหลัง",
      actorUid: actor.uid, actorName: actor.displayName, organizationId: "main", timestamp: serverTimestamp()
    });
  });
  await syncEditedShareLinks(job.id, {
    organizationId: "main", carrierName, customer: draft.customer.trim(), pickupLocation: draft.pickupLocation.trim(),
    pickupPlace: draft.pickupPlace, deliveryLocation: draft.deliveryLocation.trim(), deliveryPlace: draft.deliveryPlace,
    vehiclePlate: draft.vehiclePlate.trim(), eta: draft.deliveryTime, lastUpdatedAt: completed.toISOString()
  });
}
