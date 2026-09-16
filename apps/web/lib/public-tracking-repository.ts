import { doc, onSnapshot, type DocumentData, type Unsubscribe } from "firebase/firestore";
import { db } from "./firebase";

export type PublicTrackingJob = {
  workOrder: string;
  customerName: string;
  statusLabel: string;
  pickupLocation: string;
  deliveryLocation: string;
  vehicleLabel: string;
  carrierName: string;
  eta: string;
  lastUpdatedAt: string;
  location: { lat: number; lng: number } | null;
};

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
    vehicleLabel: data.vehicleLabel ?? "รถขนส่ง",
    carrierName: data.carrierName ?? "S Fast Transport",
    eta: data.eta ?? "กำลังคำนวณ",
    lastUpdatedAt: data.lastUpdatedAt ?? "-",
    location: Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  };
}
