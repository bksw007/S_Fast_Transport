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
  return onSnapshot(
    doc(db, "tracking_share_links", token),
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
        return;
      }

      const data = snapshot.data();
      onData(toPublicTrackingJob(data));
    },
    (error) => onError(error.message)
  );
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
