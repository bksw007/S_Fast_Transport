import { doc, onSnapshot, type DocumentData, type Unsubscribe } from "firebase/firestore";
import { db } from "./firebase";
import type { DriverDocumentKind } from "./resource-repository";

export type PublicDriverDocument = {
  kind: DriverDocumentKind;
  fileName: string;
  contentType: string;
  url: string;
};

export type PublicDriverProfile = {
  organizationName: string;
  name: string;
  phone: string;
  email: string;
  licenseNumber: string;
  licenseType: string;
  licenseExpiry: string;
  assignedVehiclePlate: string;
  assignedVehicleType: string;
  statusLabel: string;
  photoURL: string;
  documents: PublicDriverDocument[];
  expiresAt: number;
};

export function subscribePublicDriver(
  token: string,
  onData: (driver: PublicDriverProfile | null) => void,
  onError: (message: string) => void
): Unsubscribe {
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = onSnapshot(
    doc(db, "driver_share_links", token),
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
      onData(toPublicDriverProfile(data, expiresAt));
      checkExpiry();
    },
    (error) => { onData(null); onError(error.message); }
  );
  return () => { unsubscribe(); if (expiryTimer) clearTimeout(expiryTimer); };
}

function toDocuments(value: unknown): PublicDriverDocument[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<DriverDocumentKind>(["idCard", "driverLicense"]);
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const document = candidate as Record<string, unknown>;
    const kind = String(document.kind ?? "") as DriverDocumentKind;
    const url = String(document.url ?? "");
    if (!allowed.has(kind) || !url.startsWith("https://")) return [];
    return [{
      kind,
      url,
      fileName: String(document.fileName ?? ""),
      contentType: String(document.contentType ?? "")
    }];
  });
}

function toPublicDriverProfile(data: DocumentData, expiresAt: number): PublicDriverProfile {
  return {
    organizationName: data.organizationName ?? "S Fast Transport",
    name: data.name ?? "-",
    phone: data.phone ?? "",
    email: data.email ?? "",
    licenseNumber: data.licenseNumber ?? "",
    licenseType: data.licenseType ?? "",
    licenseExpiry: data.licenseExpiry ?? "",
    assignedVehiclePlate: data.assignedVehiclePlate ?? "",
    assignedVehicleType: data.assignedVehicleType ?? "",
    statusLabel: data.statusLabel ?? "ไม่ระบุสถานะ",
    photoURL: typeof data.photoURL === "string" && data.photoURL.startsWith("https://") ? data.photoURL : "",
    documents: toDocuments(data.documents),
    expiresAt
  };
}
