import { doc, onSnapshot, type DocumentData, type Unsubscribe } from "firebase/firestore";
import { db } from "./firebase";
import { firebaseApp } from "./firebase";
import type { JobPlace } from "@s-fast-transport/shared";

export type PublicTrackingJob = {
  workOrder: string;
  customerName: string;
  statusLabel: string;
  pickupLocation: string;
  deliveryLocation: string;
  pickupPlace?: JobPlace;
  deliveryPlace?: JobPlace;
  vehicleLabel: string;
  carrierName: string;
  eta: string;
  lastUpdatedAt: string;
  location: { lat: number; lng: number } | null;
};

export type PublicProof = { photoCount: number; hasSignature: boolean; signerName: string; signedAt: string };
export type PublicTrackingDetails = {
  workOrder: string;
  status: string;
  customer: string;
  carrierName: string;
  jobDate: string;
  cargoType: string;
  tripCount: number;
  driverName: string;
  driverPhone: string;
  vehiclePlate: string;
  vehicleType: string;
  routeDistanceMeters: number | null;
  pickupLocation: string;
  pickupDate: string;
  pickupTime: string;
  deliveryLocation: string;
  deliveryDate: string;
  deliveryTime: string;
  returnTrip: { pickupLocation: string; pickupDate: string; pickupTime: string; deliveryLocation: string; deliveryDate: string; deliveryTime: string } | null;
  activeLeg: 1 | 2;
  eta: string;
  arrivedDeliveryAt: string;
  completedAt: string;
  pickupProof: PublicProof;
  deliveryProof: PublicProof;
  returnPickupProof: PublicProof;
  returnDeliveryProof: PublicProof;
  handoverDocumentPhotoCount: number;
  returnArrivedDeliveryAt: string;
  issue: { type: string; note: string; reportedAt: string; resolvedAt: string; resolutionNote: string; hasPhoto: boolean } | null;
};

function publicTrackingAccessUrl(token: string) {
  const projectId = firebaseApp.options.projectId;
  if (!projectId) throw new Error("ยังไม่ได้ตั้งค่าโครงการ Firebase");
  const url = new URL(`https://asia-southeast1-${projectId}.cloudfunctions.net/publicTrackingAccess`);
  url.searchParams.set("token", token);
  return url;
}

export function publicTrackingAssetUrl(token: string, stage: "pickup" | "delivery" | "returnPickup" | "returnDelivery", kind: "photo" | "signature", index?: number): string;
export function publicTrackingAssetUrl(token: string, stage: "handover", kind: "photo", index?: number): string;
export function publicTrackingAssetUrl(token: string, stage: "issue", kind: "issue"): string;
export function publicTrackingAssetUrl(token: string, stage: "pickup" | "delivery" | "returnPickup" | "returnDelivery" | "handover" | "issue", kind: "photo" | "signature" | "issue", index = 0) {
  const url = publicTrackingAccessUrl(token);
  url.searchParams.set("stage", stage);
  url.searchParams.set("kind", kind);
  if (kind === "photo") url.searchParams.set("index", String(index));
  return url.toString();
}

export async function fetchPublicTrackingDetails(token: string, signal?: AbortSignal): Promise<PublicTrackingDetails> {
  const response = await fetch(publicTrackingAccessUrl(token), { cache: "no-store", signal, referrerPolicy: "no-referrer" });
  if (!response.ok) throw new Error(response.status === 404 ? "ลิงก์หมดอายุหรือไม่พบข้อมูลใบงาน" : "โหลดรายละเอียดงานไม่สำเร็จ");
  return await response.json() as PublicTrackingDetails;
}

export function subscribePublicTracking(
  token: string,
  onData: (tracking: PublicTrackingJob | null) => void,
  onError: (message: string) => void
): Unsubscribe {
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = onSnapshot(
    doc(db, "tracking_share_links", token),
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
        return;
      }

      const data = snapshot.data();
      if (expiryTimer) clearTimeout(expiryTimer);
      const expiresAt = data.expiresAt?.toMillis?.() ?? 0;
      const checkExpiry = () => {
        const remaining = expiresAt - Date.now();
        if (!data.enabled || remaining <= 0) { onData(null); return; }
        expiryTimer = setTimeout(checkExpiry, Math.min(remaining, 2147483647));
      };
      if (!data.enabled || expiresAt <= Date.now()) { onData(null); return; }
      onData(toPublicTrackingJob(data));
      checkExpiry();
    },
    (error) => { onData(null); onError(error.message); }
  );
  return () => { unsubscribe(); if (expiryTimer) clearTimeout(expiryTimer); };
}

function toPublicTrackingJob(data: DocumentData): PublicTrackingJob {
  const lat = Number(data.currentLocation?.lat);
  const lng = Number(data.currentLocation?.lng);

  return {
    workOrder: data.workOrder ?? "-",
    customerName: data.customerName ?? "ลูกค้า",
    statusLabel: data.statusLabel ?? "กำลังดำเนินการ",
    pickupLocation: data.pickupLocation ?? "-",
    deliveryLocation: data.deliveryLocation ?? "-",
    pickupPlace: toJobPlace(data.pickupPlace),
    deliveryPlace: toJobPlace(data.deliveryPlace),
    vehicleLabel: data.vehicleLabel ?? "รถขนส่ง",
    carrierName: data.carrierName ?? "S Fast Transport",
    eta: data.eta ?? "กำลังคำนวณ",
    lastUpdatedAt: data.lastUpdatedAt ?? "-",
    location: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  };
}

function toJobPlace(value: unknown): JobPlace | undefined {
  if (!value || typeof value !== "object") return undefined;
  const data = value as Record<string, unknown>;
  const lat = Number(data.lat);
  const lng = Number(data.lng);
  const navigationUrl = String(data.navigationUrl ?? "");
  if (!navigationUrl.startsWith("https://") || !Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return {
    name: String(data.name ?? "สถานที่"),
    originalMapsUrl: String(data.originalMapsUrl ?? navigationUrl),
    navigationUrl,
    lat,
    lng,
    ...(data.locationId ? { locationId: String(data.locationId) } : {}),
    ...(data.googleName ? { googleName: String(data.googleName) } : {}),
    ...(data.googlePlaceId ? { googlePlaceId: String(data.googlePlaceId) } : {})
  };
}
