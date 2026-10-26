import { doc, getDoc, runTransaction, serverTimestamp, Timestamp } from "firebase/firestore";
import { deleteObject, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "./firebase";
import { compressImageForUpload, isImageFile, MAX_SOURCE_IMAGE_BYTES } from "./image-upload";
import { resolveCustomerId } from "./customer-repository";
import { hasApprovedAccess, isMainAdmin, type UserProfile } from "./transport-repository";
import { historicalWorkOrder } from "./historical-work-order";
import { loadCompanySettings } from "./settings-repository";
import type { JobPlace } from "@s-fast-transport/shared";

export const historicalPhotoCategories = ["pickup", "delivery", "document", "expense"] as const;
export type HistoricalPhotoCategory = typeof historicalPhotoCategories[number];
export type HistoricalPhotos = Record<HistoricalPhotoCategory, File[]>;
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
  arrivedDeliveryAt: string;
  completedAt: string;
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

export function validateHistoricalJob(draft: HistoricalJobDraft, photos: HistoricalPhotos) {
  const required = [draft.customer, draft.carrierOrganizationId, draft.driverId, draft.vehiclePlate, draft.pickupLocation, draft.deliveryLocation];
  if (required.some(value => !value.trim())) throw new Error("กรุณาเลือกลูกค้า บริษัทขนส่ง คนขับ และระบุทะเบียนรถกับสถานที่รับ–ส่งให้ครบ");
  if (![draft.pickupDate, draft.deliveryDate].every(validDate)) throw new Error("กรุณาระบุวันที่งานให้ถูกต้องและครบถ้วน");
  if (draft.pickupDate > bangkokToday() || draft.deliveryDate > bangkokToday()) throw new Error("งานย้อนหลังต้องไม่ระบุวันที่ในอนาคต");
  if (draft.deliveryDate < draft.pickupDate) throw new Error("วันที่ส่งสินค้าต้องไม่ก่อนวันที่รับสินค้า");
  if (draft.pickupTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.pickupTime) || draft.deliveryTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.deliveryTime)) throw new Error("เวลาในใบงานไม่ถูกต้อง");
  const completed = dateTime(draft.completedAt, "เวลาจบงานจริง");
  const arrived = draft.arrivedDeliveryAt ? dateTime(draft.arrivedDeliveryAt, "เวลาถึงจุดส่งจริง") : null;
  const dayStart = dateTime(`${draft.pickupDate}T00:00`, "วันที่รับสินค้า");
  if (completed < dayStart || completed > new Date() || arrived && (arrived < dayStart || arrived > completed)) throw new Error("เวลาถึงจุดส่งหรือเวลาจบงานไม่สอดคล้องกับวันที่ทำงาน");
  const tripCount = Number(draft.tripCount);
  if (!Number.isInteger(tripCount) || tripCount < 1 || tripCount > 999) throw new Error("จำนวนเที่ยวต้องอยู่ระหว่าง 1–999");
  if (!photos.pickup.length || !photos.delivery.length) throw new Error("กรุณาแนบรูปรับสินค้าและรูปลงสินค้าอย่างน้อยหมวดละ 1 รูป");
  for (const category of historicalPhotoCategories) {
    if (photos[category].length > 10 || photos[category].some(file => !isImageFile(file) || file.size < 1 || file.size > MAX_SOURCE_IMAGE_BYTES)) throw new Error("แต่ละหมวดแนบได้ไม่เกิน 10 รูป และรูปต้นฉบับต้องไม่เกิน 20 MB ต่อรูป");
  }
  return { completed, arrived, tripCount };
}

export async function createHistoricalJob(draft: HistoricalJobDraft, photos: HistoricalPhotos, actor: UserProfile, onProgress?: (message: string) => void) {
  if (!hasApprovedAccess(actor) || !isMainAdmin(actor) || actor.organizationId !== "main") throw new Error("เฉพาะแอดมินบริษัทหลักเท่านั้นที่เพิ่มใบงานย้อนหลังได้");
  const { completed, arrived, tripCount } = validateHistoricalJob(draft, photos);
  const company = draft.carrierOrganizationId === "main" ? null : (await getDoc(doc(db, "organizations", draft.carrierOrganizationId))).data();
  if (draft.carrierOrganizationId !== "main" && (company?.type !== "subcontract" || company.deleted === true)) throw new Error("ไม่พบบริษัทขนส่งที่เลือก กรุณาเลือกใหม่");
  const carrierName = draft.carrierOrganizationId === "main"
    ? (await loadCompanySettings("main")).name || actor.organizationName || "S Fast Transport"
    : String(company?.name || "").trim();
  const driver = (await getDoc(doc(db, "drivers", draft.driverId))).data();
  if (!driver || driver.organizationId !== draft.carrierOrganizationId || !String(driver.name || "").trim()) throw new Error("คนขับไม่อยู่ในบริษัทขนส่งที่เลือก กรุณาเลือกใหม่");
  const jobRef = doc(db, "today_jobs", draft.submissionId);
  const existing = await getDoc(jobRef);
  if (existing.exists()) {
    if (existing.data().historical && existing.data().createdByUid === actor.uid) return existing.data().workOrder as string;
    throw new Error("รหัสรายการนี้ถูกใช้แล้ว กรุณาเปิดฟอร์มใหม่");
  }
  const paths = { pickup: [] as string[], delivery: [] as string[], document: [] as string[], expense: [] as string[] };
  const uploaded: string[] = [];
  try {
    for (const category of historicalPhotoCategories) {
      for (const [index, source] of photos[category].entries()) {
        onProgress?.(`กำลังอัปโหลด${category === "pickup" ? "รูปรับสินค้า" : category === "delivery" ? "รูปลงสินค้า" : category === "document" ? "รูปเอกสาร" : "รูปค่าใช้จ่าย"} ${index + 1}/${photos[category].length}`);
        const file = await compressImageForUpload(source);
        const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
        const path = `historical_jobs/${jobRef.id}/${actor.uid}/${category}/${crypto.randomUUID()}.${extension}`;
        await uploadBytes(ref(storage, path), file, { contentType: file.type });
        uploaded.push(path);
        paths[category].push(path);
      }
    }
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
        driverId: draft.driverId, driverName: String(driver.name).trim(), driverPhone: String(driver.phone || ""), vehiclePlate: draft.vehiclePlate.trim(),
        vehicleType: draft.vehicleType.trim(), cargoType: draft.cargoType.trim(), tripCount,
        jobDate: draft.pickupDate, pickupDate: draft.pickupDate, pickupTime: draft.pickupTime,
        pickupLocation: draft.pickupLocation.trim(), ...(draft.pickupPlace ? { pickupPlace: draft.pickupPlace } : {}), deliveryDate: draft.deliveryDate,
        deliveryTime: draft.deliveryTime, deliveryLocation: draft.deliveryLocation.trim(), ...(draft.deliveryPlace ? { deliveryPlace: draft.deliveryPlace } : {}),
        ...(arrived ? { arrivedDeliveryAt: Timestamp.fromDate(arrived) } : {}), completedAt: Timestamp.fromDate(completed),
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
