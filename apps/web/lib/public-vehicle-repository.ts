import { doc, onSnapshot, type DocumentData, type Unsubscribe } from "firebase/firestore";
import { db } from "./firebase";
import type { VehicleDocumentKind, VehicleImageKind } from "./resource-repository";

export type PublicVehicleFile<K extends string> = {
  kind: K;
  fileName: string;
  contentType: string;
  url: string;
};

export type PublicVehicleProfile = {
  organizationName: string;
  plate: string;
  vehicleType: string;
  brand: string;
  model: string;
  capacityKg: number | null;
  vehicleWeightKg: number | null;
  compulsoryInsuranceExpiry: string;
  insuranceExpiry: string;
  statusLabel: string;
  documents: PublicVehicleFile<VehicleDocumentKind>[];
  images: PublicVehicleFile<VehicleImageKind>[];
  expiresAt: number;
};

export function subscribePublicVehicle(
  token: string,
  onData: (vehicle: PublicVehicleProfile | null) => void,
  onError: (message: string) => void
): Unsubscribe {
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = onSnapshot(
    doc(db, "vehicle_share_links", token),
    (snapshot) => {
      if (!snapshot.exists()) { onData(null); return; }
      const data = snapshot.data();
      if (expiryTimer) clearTimeout(expiryTimer);
      const expiresAt = data.expiresAt?.toMillis?.() ?? 0;
      const checkExpiry = () => {
        const remaining = expiresAt - Date.now();
        if (!data.enabled || remaining <= 0) { onData(null); return; }
        expiryTimer = setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647));
      };
      if (!data.enabled || expiresAt <= Date.now()) { onData(null); return; }
      onData(toPublicVehicleProfile(data, expiresAt));
      checkExpiry();
    },
    (error) => { onData(null); onError(error.message); }
  );
  return () => { unsubscribe(); if (expiryTimer) clearTimeout(expiryTimer); };
}

function toFiles<K extends string>(value: unknown, allowedKinds: readonly K[]): PublicVehicleFile<K>[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(allowedKinds);
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const file = candidate as Record<string, unknown>;
    const kind = String(file.kind ?? "") as K;
    const url = String(file.url ?? "");
    if (!allowed.has(kind) || !url.startsWith("https://")) return [];
    return [{
      kind,
      url,
      fileName: String(file.fileName ?? ""),
      contentType: String(file.contentType ?? "")
    }];
  });
}

function toPublicVehicleProfile(data: DocumentData, expiresAt: number): PublicVehicleProfile {
  return {
    organizationName: data.organizationName ?? "S Fast Transport",
    plate: data.plate ?? "-",
    vehicleType: data.vehicleType ?? "-",
    brand: data.brand ?? "",
    model: data.model ?? "",
    capacityKg: Number.isFinite(data.capacityKg) ? data.capacityKg : null,
    vehicleWeightKg: Number.isFinite(data.vehicleWeightKg) ? data.vehicleWeightKg : null,
    compulsoryInsuranceExpiry: data.compulsoryInsuranceExpiry ?? "",
    insuranceExpiry: data.insuranceExpiry ?? "",
    statusLabel: data.statusLabel ?? "ไม่ระบุสถานะ",
    documents: toFiles(data.documents, ["compulsoryInsurance", "vehicleInsurance", "cargoInsurance", "other"] as const),
    images: toFiles(data.images, ["front", "rear", "right", "left"] as const),
    expiresAt
  };
}
