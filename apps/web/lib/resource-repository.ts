import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Unsubscribe
} from "firebase/firestore";
import { db } from "./firebase";
import { isMainAdmin, type UserProfile } from "./transport-repository";

export type SubcontractOrganization = {
  id: string;
  name: string;
  taxId: string;
  contactName: string;
  phone: string;
  email: string;
  logoUrl: string;
  active: boolean;
};

export type OrganizationDraft = Omit<SubcontractOrganization, "id" | "active"> & { code: string };

export type VehicleStatus = "available" | "assigned" | "maintenance" | "inactive";

export type TransportVehicle = {
  id: string;
  organizationId: string;
  plate: string;
  vehicleType: string;
  brand: string;
  model: string;
  capacityKg: number | null;
  registrationExpiry: string;
  insuranceExpiry: string;
  gpsDeviceId: string;
  status: VehicleStatus;
};

export type VehicleDraft = Omit<TransportVehicle, "id" | "organizationId" | "capacityKg"> & {
  capacityKg: string;
};

export type DriverStatus = "available" | "assigned" | "leave" | "inactive";

export type TransportDriver = {
  id: string;
  organizationId: string;
  userUid: string;
  name: string;
  phone: string;
  email: string;
  licenseNumber: string;
  licenseType: string;
  licenseExpiry: string;
  assignedVehicleId: string;
  status: DriverStatus;
};

export type DriverDraft = Omit<TransportDriver, "id" | "organizationId">;

export function isMainCompanyAdmin(profile: UserProfile) {
  return isMainAdmin(profile)
    && profile.organizationType === "main"
    && profile.organizationId === "main";
}

function canManageOrganization(profile: UserProfile, organizationId: string) {
  return isMainCompanyAdmin(profile)
    || (
      profile.role === "subcontract_admin"
      && profile.organizationType === "subcontract"
      && profile.organizationId === organizationId
    );
}

function assertMainCompanyAdmin(profile: UserProfile) {
  if (!isMainCompanyAdmin(profile)) {
    throw new Error("เฉพาะแอดมินบริษัทหลักเท่านั้นที่จัดการบริษัทซับคอนแท็คได้");
  }
}

function assertOrganizationAccess(profile: UserProfile, organizationId: string) {
  if (!canManageOrganization(profile, organizationId)) {
    throw new Error("คุณไม่มีสิทธิ์จัดการข้อมูลของบริษัทนี้");
  }
}

function cleanText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function resourceDocumentId(organizationId: string, value: string) {
  return `${encodeURIComponent(organizationId)}--${encodeURIComponent(cleanText(value).toLocaleLowerCase("th-TH"))}`;
}

function listOptionRef(organizationId: string, field: "vehicle_type" | "vehicle_plate" | "driver", value: string) {
  const normalizedValue = cleanText(value).toLocaleLowerCase("th-TH");
  return doc(
    db,
    "organizations",
    organizationId,
    "list_options",
    `${field}--${encodeURIComponent(normalizedValue)}`
  );
}

function listOptionPayload(
  organizationId: string,
  field: "vehicle_type" | "vehicle_plate" | "driver",
  value: string,
  actor: UserProfile
) {
  return {
    organizationId,
    field,
    value: cleanText(value),
    normalizedValue: cleanText(value).toLocaleLowerCase("th-TH"),
    createdByUid: actor.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
}

function toOrganization(id: string, data: DocumentData): SubcontractOrganization {
  return {
    id,
    name: data.name ?? id,
    taxId: data.taxId ?? "",
    contactName: data.contactName ?? "",
    phone: data.phone ?? "",
    email: data.email ?? "",
    logoUrl: data.logoUrl ?? data.organizationLogoUrl ?? "",
    active: data.active !== false
  };
}

export function subscribeSubcontractOrganizations(
  onItems: (items: SubcontractOrganization[]) => void,
  onError: (message: string) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, "organizations"), where("type", "==", "subcontract")),
    (snapshot) => onItems(snapshot.docs
      .map((item) => toOrganization(item.id, item.data()))
      .sort((a, b) => a.name.localeCompare(b.name, "th"))),
    (error) => onError(error.message)
  );
}

export async function createSubcontractOrganization(draft: OrganizationDraft, actor: UserProfile) {
  assertMainCompanyAdmin(actor);
  const organizationId = draft.code.trim().toLocaleLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(organizationId)) {
    throw new Error("รหัสบริษัทต้องเป็นอังกฤษหรือตัวเลข 2–40 ตัว และใช้ - หรือ _ ได้");
  }
  if (!cleanText(draft.name)) throw new Error("กรุณากรอกชื่อบริษัท");

  const organizationRef = doc(db, "organizations", organizationId);
  if ((await getDoc(organizationRef)).exists()) throw new Error("รหัสบริษัทนี้ถูกใช้งานแล้ว");
  await setDoc(organizationRef, {
    type: "subcontract",
    name: cleanText(draft.name),
    taxId: cleanText(draft.taxId),
    contactName: cleanText(draft.contactName),
    phone: cleanText(draft.phone),
    email: cleanText(draft.email),
    logoUrl: draft.logoUrl.trim(),
    active: true,
    createdByUid: actor.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateSubcontractOrganization(
  organizationId: string,
  draft: OrganizationDraft,
  actor: UserProfile
) {
  assertMainCompanyAdmin(actor);
  if (!cleanText(draft.name)) throw new Error("กรุณากรอกชื่อบริษัท");
  await updateDoc(doc(db, "organizations", organizationId), {
    name: cleanText(draft.name),
    taxId: cleanText(draft.taxId),
    contactName: cleanText(draft.contactName),
    phone: cleanText(draft.phone),
    email: cleanText(draft.email),
    logoUrl: draft.logoUrl.trim(),
    updatedByUid: actor.uid,
    updatedAt: serverTimestamp()
  });
}

export async function setSubcontractOrganizationActive(
  organizationId: string,
  active: boolean,
  actor: UserProfile
) {
  assertMainCompanyAdmin(actor);
  await updateDoc(doc(db, "organizations", organizationId), {
    active,
    updatedByUid: actor.uid,
    updatedAt: serverTimestamp()
  });
}

function toVehicle(id: string, data: DocumentData): TransportVehicle {
  return {
    id,
    organizationId: data.organizationId ?? "",
    plate: data.plate ?? "",
    vehicleType: data.vehicleType ?? "",
    brand: data.brand ?? "",
    model: data.model ?? "",
    capacityKg: Number.isFinite(data.capacityKg) ? data.capacityKg : null,
    registrationExpiry: data.registrationExpiry ?? "",
    insuranceExpiry: data.insuranceExpiry ?? "",
    gpsDeviceId: data.gpsDeviceId ?? "",
    status: data.status ?? "available"
  };
}

export function subscribeVehicles(
  organizationId: string,
  onItems: (items: TransportVehicle[]) => void,
  onError: (message: string) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, "vehicles"), where("organizationId", "==", organizationId)),
    (snapshot) => onItems(snapshot.docs
      .map((item) => toVehicle(item.id, item.data()))
      .sort((a, b) => a.plate.localeCompare(b.plate, "th"))),
    (error) => onError(error.message)
  );
}

function vehiclePayload(organizationId: string, draft: VehicleDraft) {
  const plate = cleanText(draft.plate);
  if (!plate) throw new Error("กรุณากรอกทะเบียนรถ");
  if (!cleanText(draft.vehicleType)) throw new Error("กรุณากรอกประเภทรถ");
  const capacity = draft.capacityKg.trim() ? Number(draft.capacityKg) : null;
  if (capacity !== null && (!Number.isFinite(capacity) || capacity < 0)) throw new Error("น้ำหนักบรรทุกไม่ถูกต้อง");
  return {
    organizationId,
    plate,
    plateNormalized: plate.toLocaleLowerCase("th-TH"),
    vehicleType: cleanText(draft.vehicleType),
    brand: cleanText(draft.brand),
    model: cleanText(draft.model),
    capacityKg: capacity,
    registrationExpiry: draft.registrationExpiry,
    insuranceExpiry: draft.insuranceExpiry,
    gpsDeviceId: cleanText(draft.gpsDeviceId),
    status: draft.status
  };
}

export async function createVehicle(organizationId: string, draft: VehicleDraft, actor: UserProfile) {
  assertOrganizationAccess(actor, organizationId);
  const payload = vehiclePayload(organizationId, draft);
  const vehicleRef = doc(db, "vehicles", resourceDocumentId(organizationId, payload.plate));
  if ((await getDoc(vehicleRef)).exists()) throw new Error("ทะเบียนรถนี้มีอยู่ในบริษัทแล้ว");
  const batch = writeBatch(db);
  batch.set(vehicleRef, {
    ...payload,
    createdByUid: actor.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  batch.set(listOptionRef(organizationId, "vehicle_plate", payload.plate), listOptionPayload(organizationId, "vehicle_plate", payload.plate, actor), { merge: true });
  batch.set(listOptionRef(organizationId, "vehicle_type", payload.vehicleType), listOptionPayload(organizationId, "vehicle_type", payload.vehicleType, actor), { merge: true });
  await batch.commit();
}

export async function updateVehicle(vehicle: TransportVehicle, draft: VehicleDraft, actor: UserProfile) {
  assertOrganizationAccess(actor, vehicle.organizationId);
  const payload = vehiclePayload(vehicle.organizationId, draft);
  const currentRef = doc(db, "vehicles", vehicle.id);
  const nextRef = doc(db, "vehicles", resourceDocumentId(vehicle.organizationId, payload.plate));
  if (currentRef.path === nextRef.path) {
    const batch = writeBatch(db);
    batch.update(currentRef, { ...payload, updatedByUid: actor.uid, updatedAt: serverTimestamp() });
    batch.set(listOptionRef(vehicle.organizationId, "vehicle_plate", payload.plate), listOptionPayload(vehicle.organizationId, "vehicle_plate", payload.plate, actor), { merge: true });
    batch.set(listOptionRef(vehicle.organizationId, "vehicle_type", payload.vehicleType), listOptionPayload(vehicle.organizationId, "vehicle_type", payload.vehicleType, actor), { merge: true });
    await batch.commit();
    return;
  }
  if ((await getDoc(nextRef)).exists()) throw new Error("ทะเบียนรถนี้มีอยู่ในบริษัทแล้ว");
  const batch = writeBatch(db);
  batch.set(nextRef, { ...payload, createdByUid: actor.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  batch.delete(currentRef);
  batch.set(listOptionRef(vehicle.organizationId, "vehicle_plate", payload.plate), listOptionPayload(vehicle.organizationId, "vehicle_plate", payload.plate, actor), { merge: true });
  batch.set(listOptionRef(vehicle.organizationId, "vehicle_type", payload.vehicleType), listOptionPayload(vehicle.organizationId, "vehicle_type", payload.vehicleType, actor), { merge: true });
  await batch.commit();
}

export async function setVehicleActive(vehicle: TransportVehicle, active: boolean, actor: UserProfile) {
  assertOrganizationAccess(actor, vehicle.organizationId);
  await updateDoc(doc(db, "vehicles", vehicle.id), {
    status: active ? "available" : "inactive",
    updatedByUid: actor.uid,
    updatedAt: serverTimestamp()
  });
}

function toDriver(id: string, data: DocumentData): TransportDriver {
  return {
    id,
    organizationId: data.organizationId ?? "",
    userUid: data.userUid ?? "",
    name: data.name ?? "",
    phone: data.phone ?? "",
    email: data.email ?? "",
    licenseNumber: data.licenseNumber ?? "",
    licenseType: data.licenseType ?? "",
    licenseExpiry: data.licenseExpiry ?? "",
    assignedVehicleId: data.assignedVehicleId ?? "",
    status: data.status ?? "available"
  };
}

export function subscribeDrivers(
  organizationId: string,
  onItems: (items: TransportDriver[]) => void,
  onError: (message: string) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, "drivers"), where("organizationId", "==", organizationId)),
    (snapshot) => onItems(snapshot.docs
      .map((item) => toDriver(item.id, item.data()))
      .sort((a, b) => a.name.localeCompare(b.name, "th"))),
    (error) => onError(error.message)
  );
}

function driverPayload(organizationId: string, draft: DriverDraft) {
  const name = cleanText(draft.name);
  const licenseNumber = cleanText(draft.licenseNumber);
  if (!name) throw new Error("กรุณากรอกชื่อคนขับ");
  if (!cleanText(draft.phone)) throw new Error("กรุณากรอกเบอร์ติดต่อ");
  if (!licenseNumber) throw new Error("กรุณากรอกเลขที่ใบขับขี่");
  return {
    organizationId,
    userUid: draft.userUid,
    name,
    phone: cleanText(draft.phone),
    email: cleanText(draft.email),
    licenseNumber,
    licenseType: cleanText(draft.licenseType),
    licenseExpiry: draft.licenseExpiry,
    assignedVehicleId: draft.assignedVehicleId,
    status: draft.status
  };
}

export async function createDriver(organizationId: string, draft: DriverDraft, actor: UserProfile) {
  assertOrganizationAccess(actor, organizationId);
  const payload = driverPayload(organizationId, draft);
  const driverRef = doc(db, "drivers", resourceDocumentId(organizationId, payload.licenseNumber));
  if ((await getDoc(driverRef)).exists()) throw new Error("เลขที่ใบขับขี่นี้มีอยู่ในบริษัทแล้ว");
  const batch = writeBatch(db);
  batch.set(driverRef, {
    ...payload,
    createdByUid: actor.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  batch.set(listOptionRef(organizationId, "driver", payload.name), listOptionPayload(organizationId, "driver", payload.name, actor), { merge: true });
  await batch.commit();
}

export async function updateDriver(driver: TransportDriver, draft: DriverDraft, actor: UserProfile) {
  assertOrganizationAccess(actor, driver.organizationId);
  const payload = driverPayload(driver.organizationId, draft);
  const currentRef = doc(db, "drivers", driver.id);
  const nextRef = driver.userUid
    ? currentRef
    : doc(db, "drivers", resourceDocumentId(driver.organizationId, payload.licenseNumber));
  if (currentRef.path === nextRef.path) {
    const batch = writeBatch(db);
    batch.update(currentRef, { ...payload, updatedByUid: actor.uid, updatedAt: serverTimestamp() });
    batch.set(listOptionRef(driver.organizationId, "driver", payload.name), listOptionPayload(driver.organizationId, "driver", payload.name, actor), { merge: true });
    await batch.commit();
    return;
  }
  if ((await getDoc(nextRef)).exists()) throw new Error("เลขที่ใบขับขี่นี้มีอยู่ในบริษัทแล้ว");
  const batch = writeBatch(db);
  batch.set(nextRef, { ...payload, createdByUid: actor.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  batch.delete(currentRef);
  batch.set(listOptionRef(driver.organizationId, "driver", payload.name), listOptionPayload(driver.organizationId, "driver", payload.name, actor), { merge: true });
  await batch.commit();
}

export async function setDriverActive(driver: TransportDriver, active: boolean, actor: UserProfile) {
  assertOrganizationAccess(actor, driver.organizationId);
  await updateDoc(doc(db, "drivers", driver.id), {
    status: active ? "available" : "inactive",
    updatedByUid: actor.uid,
    updatedAt: serverTimestamp()
  });
}
